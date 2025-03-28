from flask import Blueprint, jsonify, request, redirect, url_for, session, flash
from flask_login import current_user, login_required, login_user
from github import Github, GithubException
from dotenv import load_dotenv
from models import db, GitHubRepo, Site, User
import os
import requests

load_dotenv()

github_bp = Blueprint('github', __name__)

GITHUB_CLIENT_ID = os.getenv('GITHUB_CLIENT_ID')
GITHUB_CLIENT_SECRET = os.getenv('GITHUB_CLIENT_SECRET')
GITHUB_CALLBACK_URL = os.getenv('GITHUB_CALLBACK_URL')


@github_bp.route('/api/github/status')
@login_required
def github_status():
    """Check GitHub connection status"""
    access_token = session.get('github_token') or current_user.github_token
    if not access_token:
        return jsonify({'connected': False, 'repo_connected': False})

    try:
        g = Github(access_token)
        user = g.get_user()

        site_id = session.get('current_site_id')
        if site_id:
            site = Site.query.get(site_id)
            if site and site.github_repo:
                return jsonify({
                    'connected': True,
                    'repo_connected': True,
                    'username': user.login,
                    'repo_name': site.github_repo.repo_name,
                    'repo_url': site.github_repo.repo_url
                })

        if access_token and not session.get('github_token'):
            session['github_token'] = access_token
        return jsonify({
            'connected': True,
            'repo_connected': False,
            'username': user.login
        })
    except Exception as e:
        print(f'GitHub status error: {str(e)}')
        return jsonify({'connected': False, 'repo_connected': False})


@github_bp.route('/api/github/login')
def github_login():
    """Redirect to GitHub OAuth login"""
    next_url = request.args.get('next')
    if next_url:
        session['next_url'] = next_url

    return redirect(f'https://github.com/login/oauth/authorize?'
                    f'client_id={GITHUB_CLIENT_ID}&'
                    f'redirect_uri={GITHUB_CALLBACK_URL}&'
                    f'scope=repo delete_repo user:email')


@github_bp.route('/api/github/callback')
def github_callback():
    """Handle GitHub OAuth callback"""
    code = request.args.get('code')
    error = request.args.get('error')

    if error:
        flash('GitHub authentication failed', 'error')
        return redirect(url_for('login'))

    response = requests.post('https://github.com/login/oauth/access_token',
                             headers={'Accept': 'application/json'},
                             data={
                                 'client_id': GITHUB_CLIENT_ID,
                                 'client_secret': GITHUB_CLIENT_SECRET,
                                 'code': code,
                                 'redirect_uri': GITHUB_CALLBACK_URL
                             })

    data = response.json()
    if 'access_token' in data:
        access_token = data['access_token']
        session['github_token'] = access_token

        g = Github(access_token)
        gh_user = g.get_user()

        user = None
        if current_user.is_authenticated:
            user = current_user
            user.github_token = access_token
            user.github_username = gh_user.login
            db.session.commit()
        else:
            try:
                primary_email = gh_user.email

                if not primary_email:
                    emails = gh_user.get_emails()
                    for email in emails:
                        if email.primary:
                            primary_email = email.email
                            break

                if not primary_email:
                    flash('Could not get email from GitHub account', 'error')
                    return redirect(url_for('login'))

            except Exception as e:
                print(f'Error getting GitHub email: {str(e)}')
                flash('Could not get email from GitHub account', 'error')
                return redirect(url_for('login'))

            if primary_email:
                user = User.query.filter_by(email=primary_email).first()
                if user:
                    user.github_token = access_token
                    user.github_username = gh_user.login
                    db.session.commit()
                    login_user(user)
                else:
                    user = User(username=gh_user.login,
                                email=primary_email,
                                github_token=access_token,
                                preview_code_verified=True)
                    import secrets
                    random_password = secrets.token_urlsafe(32)
                    user.set_password(random_password)
                    db.session.add(user)
                    db.session.commit()
                    login_user(user)

        next_url = session.pop('next_url', None)
        return redirect(next_url or url_for('welcome'))

    flash('Failed to authenticate with GitHub', 'error')
    return redirect(url_for('login'))


@github_bp.route('/api/github/create-repo', methods=['POST'])
@login_required
def create_repo():
    """Create a new GitHub repository"""
    try:
        access_token = session.get('github_token')
        if not access_token:
            if current_user.github_token:
                session['github_token'] = current_user.github_token
                access_token = current_user.github_token
            else:
                return jsonify({
                    'error':
                    'No GitHub account connected. Please link your GitHub account.'
                }), 401

        site_id = request.args.get('site_id') or session.get('current_site_id')
        if not site_id:
            return jsonify(
                {'error': 'No site ID provided. Please select a site.'}), 400

        site = Site.query.get(site_id)
        if not site:
            return jsonify({'error': 'Site not found'}), 404
        if site.user_id != current_user.id:
            return jsonify(
                {'error':
                 'You do not have permission to access this site'}), 403

        if site.github_repo:
            return jsonify({
                'error':
                'This site already has a GitHub repository connected'
            }), 400

        data = request.json
        if not data:
            return jsonify({'error': 'No repository data provided'}), 400

        name = data.get('name')
        if not name:
            return jsonify({'error': 'Repository name is required'}), 400

        description = data.get('description', '')
        private = data.get('private', True)

        g = Github(access_token)
        user = g.get_user()
        repo = user.create_repo(name=name,
                                description=description,
                                private=private,
                                auto_init=True)

        # Add attribution text to README.md
        try:
            readme_content = "# " + name + "\n\nMade with Hack Club Spaces 💖 (Dont remove this for YSWS)\n"
            readme = repo.get_contents("README.md")
            repo.update_file("README.md", "Update README with attribution", readme_content, readme.sha)
        except Exception as e:
            print(f"Error updating README: {str(e)}")

        github_repo = GitHubRepo(repo_name=repo.full_name,
                                 repo_url=repo.html_url,
                                 is_private=private,
                                 site_id=site_id)

        db.session.add(github_repo)
        db.session.commit()

        return jsonify({
            'message': 'Repository created successfully',
            'repo_name': repo.full_name,
            'repo_url': repo.html_url
        })

    except GithubException as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f'Error creating repository: {str(e)}')
        db.session.rollback()
        return jsonify({'error': 'Failed to create repository'}), 500
    

@github_bp.route('/api/github/repo-info')
@login_required
def repo_info():
    """Get information about the connected repository"""
    try:
        site_id = request.args.get('site_id') or session.get('current_site_id')
        if not site_id:
            return jsonify({'error': 'No site ID provided'}), 400

        site = Site.query.get(site_id)
        if not site:
            return jsonify({'error': 'Site not found'}), 404
        if site.user_id != current_user.id:
            return jsonify(
                {'error':
                 'You do not have permission to access this site'}), 403

        github_repo = GitHubRepo.query.filter_by(site_id=site.id).first()
        if not github_repo:
            return jsonify({
                'error': 'No repository connected to this site',
                'needs_repo': True
            }), 404

        access_token = session.get('github_token') or current_user.github_token
        if not access_token:
            return jsonify({
                'error': 'No GitHub token found',
                'needs_auth': True
            }), 401

        try:
            g = Github(access_token)
            repo = g.get_repo(github_repo.repo_name)
            if repo.html_url != github_repo.repo_url:
                github_repo.repo_url = repo.html_url
                db.session.commit()
        except GithubException as e:
            if e.status == 404:
                db.session.delete(github_repo)
                db.session.commit()
                return jsonify({
                    'error': 'Repository no longer exists on GitHub',
                    'needs_repo': True
                }), 404
            elif e.status == 401:
                return jsonify({
                    'error': 'GitHub token is invalid',
                    'needs_auth': True
                }), 401
            else:
                raise

        return jsonify({
            'repo_name':
            github_repo.repo_name,
            'repo_url':
            github_repo.repo_url,
            'is_private':
            github_repo.is_private,
            'created_at':
            github_repo.created_at.isoformat()
            if github_repo.created_at else None,
            'updated_at':
            github_repo.updated_at.isoformat()
            if github_repo.updated_at else None
        })
    except Exception as e:
        print(f'Error getting repo info: {str(e)}')
        return jsonify({'error': 'Failed to get repository information'}), 500


@github_bp.route('/api/github/push', methods=['POST'])
@login_required
def push_changes():
    """Push changes to GitHub repository"""
    try:
        access_token = session.get('github_token')
        if not access_token:
            if current_user.github_token:
                session['github_token'] = current_user.github_token
                access_token = current_user.github_token
            else:
                return jsonify({'error': 'No GitHub account connected'}), 401

        site_id = request.args.get('site_id') or session.get('current_site_id')
        if not site_id:
            return jsonify({'error': 'No site ID provided'}), 400

        site = Site.query.get(site_id)
        if not site:
            return jsonify({'error': 'Site not found'}), 404
        if site.user_id != current_user.id:
            return jsonify(
                {'error':
                 'You do not have permission to access this site'}), 403

        github_repo = GitHubRepo.query.filter_by(site_id=site.id).first()
        if not github_repo:
            return jsonify({'error':
                            'No repository connected to this site'}), 404

        data = request.json
        if not data:
            return jsonify({'error': 'No commit data provided'}), 400

        commit_message = data.get('message', 'Update from Spaces')

        g = Github(access_token)
        repo = g.get_repo(github_repo.repo_name)

        files_to_update = {
            'index.html': site.html_content or '',
            'main.py': site.python_content or ''
        }

        for file_path, content in files_to_update.items():
            try:
                file = repo.get_contents(file_path)
                repo.update_file(file_path, commit_message, content, file.sha)
            except GithubException as e:
                if e.status == 404:
                    repo.create_file(file_path, commit_message, content)
                else:
                    raise

        return jsonify({
            'message': 'Changes pushed successfully',
            'repo_url': github_repo.repo_url
        })

    except GithubException as e:
        print(f'GitHub error: {str(e)}')
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f'Error pushing changes: {str(e)}')
        return jsonify({'error': 'Failed to push changes'}), 500


@github_bp.route('/api/github/delete-repo', methods=['POST'])
@login_required
def delete_repo():
    """Delete a GitHub repository"""
    try:
        access_token = session.get('github_token')
        if not access_token:
            if current_user.github_token:
                session['github_token'] = current_user.github_token
                access_token = current_user.github_token
            else:
                return jsonify({'error': 'No GitHub account connected'}), 401

        site_id = request.args.get('site_id') or session.get('current_site_id')
        if not site_id:
            return jsonify({'error': 'No site ID provided'}), 400

        site = Site.query.get(site_id)
        if not site:
            return jsonify({'error': 'Site not found'}), 404
        if site.user_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403

        github_repo = GitHubRepo.query.filter_by(site_id=site.id).first()
        if not github_repo:
            return jsonify({'error': 'No repository connected'}), 404

        g = Github(access_token)
        repo = g.get_repo(github_repo.repo_name)
        repo.delete()

        db.session.delete(github_repo)
        db.session.commit()

        return jsonify({'message': 'Repository deleted successfully'})
    except GithubException as e:
        print(f'GitHub error: {str(e)}')
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        print('Delete repo error:', str(e))
        return jsonify({'error': 'Failed to delete repository'}), 500


@github_bp.route('/api/github/disconnect-repo', methods=['POST'])
@login_required
def disconnect_repo():
    """Disconnect the GitHub repository from the site"""
    try:
        site_id = request.args.get('site_id')
        if not site_id:
            site_id = session.get('current_site_id')
            if not site_id:
                return jsonify({'error': 'No site ID provided'}), 400
        site = Site.query.get(site_id)
        if not site:
            return jsonify({'error': 'Site not found'}), 404
        if site.user_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403
        github_repo = GitHubRepo.query.filter_by(site_id=site.id).first()
        if not github_repo:
            return jsonify({'error': 'No repository connected'}), 404
        db.session.delete(github_repo)
        db.session.commit()
        return jsonify({'message': 'Repository disconnected successfully'})
    except Exception as e:
        db.session.rollback()
        print('Disconnect error:', str(e))
        return jsonify({'error': 'Failed to disconnect repository'}), 500