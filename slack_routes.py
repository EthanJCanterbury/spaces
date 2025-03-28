from flask import Blueprint, redirect, request, url_for, session, flash
from flask_login import login_user
from models import db, User
import os
import requests

slack_bp = Blueprint('slack', __name__)


def get_slack_oauth_url():
    if not os.getenv('SLACK_CLIENT_ID') or not os.getenv('SLACK_REDIRECT_URI'):
        raise ValueError("Slack credentials not configured")

    encoded_redirect_uri = requests.utils.quote(
        os.getenv('SLACK_REDIRECT_URI'), safe='')

    return ("https://slack.com/oauth/v2/authorize?"
            f"client_id={os.getenv('SLACK_CLIENT_ID')}&"
            "scope=openid,email,profile&"
            f"redirect_uri={encoded_redirect_uri}&"
            "response_type=code")


@slack_bp.route('/api/slack/login')
def slack_login():
    return redirect(get_slack_oauth_url())


@slack_bp.route('/api/slack/callback')
def slack_callback():
    code = request.args.get('code')
    if not code:
        flash('Slack authentication failed', 'error')
        return redirect(url_for('login'))

    response = requests.post('https://slack.com/api/oauth.v2.access',
                             data={
                                 'client_id': os.getenv('SLACK_CLIENT_ID'),
                                 'client_secret':
                                 os.getenv('SLACK_CLIENT_SECRET'),
                                 'code': code,
                                 'redirect_uri':
                                 os.getenv('SLACK_REDIRECT_URI')
                             })

    if not response.ok:
        flash('Failed to authenticate with Slack', 'error')
        return redirect(url_for('login'))

    data = response.json()
    if not data.get('ok'):
        flash(f"Slack authentication error: {data.get('error')}", 'error')
        return redirect(url_for('login'))

    user_id = data['authed_user']['id']

    user_response = requests.get(
        'https://slack.com/api/openid.connect.userInfo',
        headers={
            'Authorization': f"Bearer {data['authed_user']['access_token']}"
        })

    if not user_response.ok:
        flash('Failed to get user information', 'error')
        return redirect(url_for('login'))

    user_data = user_response.json()
    email = user_data.get('email')
    name = user_data.get('name')

    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(username=name,
                    email=email,
                    preview_code_verified=True,
                    slack_id=user_id)
        user.set_password(os.urandom(24).hex())
        db.session.add(user)
    else:
        user.slack_id = user_id

    db.session.commit()
    login_user(user)
    return redirect(url_for('welcome'))
