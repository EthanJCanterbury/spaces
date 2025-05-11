
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
import requests
from models import db, User, Club, ClubMembership

hackatime_bp = Blueprint('hackatime', __name__, url_prefix='/api/hackatime')

@hackatime_bp.route('/club/<int:club_id>/members', methods=['GET'])
@login_required
def get_club_hackatime_members(club_id):
    """Get all club members with Hackatime API keys."""
    try:
        club = Club.query.get_or_404(club_id)
        
        # Check if user is a member of the club
        is_member = ClubMembership.query.filter_by(club_id=club_id, user_id=current_user.id).first()
        if not is_member and club.leader_id != current_user.id:
            return jsonify({'error': 'You are not a member of this club'}), 403
            
        # Get all users in the club with Hackatime API keys
        members = []
        
        # Track processed user IDs to avoid duplicates
        processed_user_ids = set()
        
        # Get leader
        leader = User.query.get(club.leader_id)
        if leader and leader.wakatime_api_key:
            # Get basic stats summary for leader
            leader_stats = get_user_hackatime_summary(leader.wakatime_api_key)
            
            members.append({
                'id': leader.id,
                'username': leader.username,
                'role': 'Club Leader',
                'avatar': leader.avatar,
                'stats': leader_stats
            })
            processed_user_ids.add(leader.id)
        
        # Get members
        memberships = ClubMembership.query.filter_by(club_id=club_id).all()
        for membership in memberships:
            # Skip if we already processed this user (e.g., if leader is also listed as a member)
            if membership.user_id in processed_user_ids:
                continue
                
            member = User.query.get(membership.user_id)
            if member and member.wakatime_api_key:
                # Get basic stats summary
                member_stats = get_user_hackatime_summary(member.wakatime_api_key)
                
                members.append({
                    'id': member.id,
                    'username': member.username,
                    'role': membership.role.capitalize(),
                    'avatar': member.avatar,
                    'stats': member_stats
                })
                processed_user_ids.add(member.id)
        
        return jsonify({'members': members})
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in get_club_hackatime_members: {str(e)}\n{error_details}")
        return jsonify({'error': f'Failed to get club hackatime members: {str(e)}', 'members': []}), 500

@hackatime_bp.route('/user/<int:user_id>/projects', methods=['GET'])
@login_required
def get_user_hackatime_projects(user_id):
    """Get Hackatime projects for a user."""
    try:
        # Check if user is allowed to see stats (must be in same club)
        user = User.query.get_or_404(user_id)
        
        # Find the clubs that both users are members of
        current_user_memberships = ClubMembership.query.filter_by(user_id=current_user.id).all()
        current_user_club_ids = [m.club_id for m in current_user_memberships]
        # Add clubs where current user is leader
        leader_clubs = Club.query.filter_by(leader_id=current_user.id).all()
        current_user_club_ids.extend([c.id for c in leader_clubs])
        
        # Check if target user is in any of these clubs
        target_user_memberships = ClubMembership.query.filter(
            ClubMembership.user_id == user_id,
            ClubMembership.club_id.in_(current_user_club_ids)
        ).first()
        
        # Also check if target user is leader of a club the current user is in
        target_user_clubs = Club.query.filter_by(leader_id=user_id).all()
        target_user_club_ids = [c.id for c in target_user_clubs]
        
        is_in_same_club = (
            target_user_memberships is not None or 
            any(club_id in target_user_club_ids for club_id in current_user_club_ids)
        )
        
        # Allow admins to see all
        if not is_in_same_club and not current_user.is_admin:
            return jsonify({'error': 'Not authorized to view this user\'s projects'}), 403
        
        # Check if user has Hackatime API key
        if not user.wakatime_api_key:
            return jsonify({'error': 'User has not connected Hackatime'}), 404
        
        # Search query param
        search_query = request.args.get('q', '').lower()
        
        # Get detailed stats with projects
        stats = get_user_hackatime_detailed_stats(user.wakatime_api_key)
        
        # Filter projects by search query if provided
        if search_query and 'projects' in stats:
            stats['projects'] = [p for p in stats['projects'] if search_query in p['name'].lower()]
            
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': f'Failed to get user hackatime projects: {str(e)}'}), 500

def get_user_hackatime_summary(api_key):
    """Get a summary of Hackatime stats for a user."""
    try:
        url = "https://hackatime.hackclub.com/api/v1/users/my/stats"
        
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        
        response = requests.get(url, headers=headers, timeout=5)
        
        if response.status_code == 200:
            data = response.json().get('data', {})
            
            # Extract top language
            languages = data.get('languages', [])
            top_language = languages[0]['name'] if languages else None
            
            return {
                'total_seconds': data.get('total_seconds', 0),
                'human_readable_total': data.get('human_readable_total', '0 hrs'),
                'daily_average': data.get('daily_average', 0),
                'human_readable_daily_average': data.get('human_readable_daily_average', '0 mins'),
                'top_language': top_language
            }
        else:
            return {
                'total_seconds': 0,
                'human_readable_total': '0 hrs',
                'daily_average': 0,
                'human_readable_daily_average': '0 mins',
                'top_language': None,
                'error': f'API error: {response.status_code}'
            }
    except Exception as e:
        return {
            'total_seconds': 0,
            'human_readable_total': '0 hrs',
            'daily_average': 0,
            'human_readable_daily_average': '0 mins',
            'top_language': None,
            'error': str(e)
        }

def get_user_hackatime_detailed_stats(api_key):
    """Get detailed Hackatime stats for a user, including projects."""
    try:
        url = "https://hackatime.hackclub.com/api/v1/users/my/stats?features=projects,languages"
        
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        
        response = requests.get(url, headers=headers, timeout=5)
        
        if response.status_code == 200:
            data = response.json().get('data', {})
            
            return {
                'username': data.get('username', ''),
                'total_seconds': data.get('total_seconds', 0),
                'human_readable_total': data.get('human_readable_total', '0 hrs'),
                'daily_average': data.get('daily_average', 0),
                'human_readable_daily_average': data.get('human_readable_daily_average', '0 mins'),
                'projects': data.get('projects', []),
                'languages': data.get('languages', [])
            }
        else:
            return {'error': f'Hackatime API error: {response.status_code}'}
    except Exception as e:
        return {'error': f'Failed to get stats: {str(e)}'}
