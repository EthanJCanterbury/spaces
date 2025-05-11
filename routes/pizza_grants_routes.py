from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
import json
import os
import time
from datetime import datetime
from airtable_service import airtable_service

pizza_grants_bp = Blueprint('pizza_grants', __name__, url_prefix='/api/pizza-grants')

# Create data directory if it doesn't exist
data_dir = 'data/pizza_grants'
os.makedirs(data_dir, exist_ok=True)

def get_submissions_file_path():
    """Get the path to the submissions JSON file"""
    return os.path.join(data_dir, 'submissions.json')

def load_submissions():
    """Load all submissions from the JSON file"""
    file_path = get_submissions_file_path()
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            # Return empty list if file is empty or invalid
            return []
    return []

def save_submissions(submissions):
    """Save submissions to the JSON file"""
    file_path = get_submissions_file_path()
    with open(file_path, 'w') as f:
        json.dump(submissions, f, indent=2)

@pizza_grants_bp.route('/submit', methods=['POST'])
@login_required
def submit_pizza_grant():
    """Submit a new pizza grant request"""
    try:
        from models import Club, ClubMembership

        # Get request data
        data = request.get_json()

        # Extract first and last name from username or user model if available
        if 'username' in data and ('first_name' not in data or 'last_name' not in data):
            from models import User
            user = User.query.filter_by(id=data.get('user_id')).first()
            if user:
                data['first_name'] = getattr(user, 'first_name', '') or ''
                data['last_name'] = getattr(user, 'last_name', '') or ''
                data['email'] = getattr(user, 'email', '') or data.get('email', '')
            else:
                # If we can't find the user, use the username as first name
                name_parts = data['username'].split()
                if len(name_parts) > 1:
                    data['first_name'] = name_parts[0]
                    data['last_name'] = ' '.join(name_parts[1:])
                else:
                    data['first_name'] = data['username']
                    data['last_name'] = ''

        # Validate required fields
        required_fields = [
            'club_id', 'user_id', 'username', 'project_name', 
            'project_description', 'project_hours', 'grant_amount',
            'shipping_address', 'github_url', 'live_url', 'screenshot', 'email', 
            'first_name', 'last_name', 'birthday', 'what_learned', 'doing_well', 'improve'
        ]

        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'message': f'Missing required field: {field}'}), 400

        # Validate shipping address fields
        address_fields = ['address1', 'city', 'state', 'zip', 'country']
        shipping_address = data.get('shipping_address', {})

        for field in address_fields:
            if field not in shipping_address or not shipping_address[field]:
                return jsonify({'success': False, 'message': f'Missing required address field: {field}'}), 400

        # Validate screenshot URL
        screenshot_url = data.get('screenshot', '')
        if not screenshot_url:
            return jsonify({'success': False, 'message': 'Screenshot URL is required'}), 400
            
        # Check if the URL ends with an image extension
        valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
        is_valid_image_url = any(screenshot_url.lower().endswith(ext) for ext in valid_extensions)
        if not is_valid_image_url:
            return jsonify({'success': False, 'message': 'Screenshot URL must point to an image file (with .jpg, .png, .gif, or similar extension)'}), 400
            
        # Format screenshot URL as an array of objects for Airtable if it's a valid URL
        if is_valid_image_url:
            # Airtable requires this format: [{"url": "https://..."}]
            data['screenshot'] = [{"url": screenshot_url}]
            
        # Validate submitter is authorized (either submitting for self or as club leader/co-leader)
        is_authorized = False
        target_user_id = int(data['user_id'])

        if target_user_id == current_user.id or current_user.is_admin:
            is_authorized = True
        else:
            # Check if current user is a club leader for this club
            club = Club.query.filter_by(
                id=data['club_id'],
                leader_id=current_user.id
            ).first()

            if club:
                # Verify target user is a member of this club
                membership = ClubMembership.query.filter_by(
                    club_id=club.id,
                    user_id=target_user_id
                ).first()

                if membership:
                    is_authorized = True

            # If not a leader, check if co-leader
            if not is_authorized:
                coleader_membership = ClubMembership.query.filter_by(
                    club_id=data['club_id'],
                    user_id=current_user.id,
                    role='co-leader'
                ).first()

                if coleader_membership:
                    # Verify target user is a member of this club
                    membership = ClubMembership.query.filter_by(
                        club_id=data['club_id'],
                        user_id=target_user_id
                    ).first()

                    if membership:
                        is_authorized = True

        if not is_authorized:
            return jsonify({'success': False, 'message': 'Unauthorized to submit for this user'}), 403

        # Add additional metadata
        data['submitted_by'] = current_user.id
        data['submitted_by_username'] = current_user.username

        # Add submission ID and timestamp if not provided
        if 'id' not in data:
            data['id'] = int(time.time() * 1000)  # Use timestamp as ID

        if 'submitted_at' not in data:
            data['submitted_at'] = datetime.now().isoformat()

        # Default status to pending if not provided
        if 'status' not in data:
            data['status'] = 'pending'
            
        # Look up club name from database
        from models import Club
        club = Club.query.filter_by(id=data['club_id']).first()
        if club:
            data['club_name'] = club.name
        else:
            data['club_name'] = "Unknown Club"

        # Log to Airtable only, no longer saving locally
        airtable_result = airtable_service.log_pizza_grant(data)

        if airtable_result is None:
            return jsonify({
                'success': False,
                'message': 'Failed to submit to Airtable'
            }), 500

        return jsonify({
            'success': True, 
            'message': 'Pizza grant submitted successfully',
            'submission_id': data['id']
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Error submitting pizza grant: {str(e)}'}), 500

@pizza_grants_bp.route('/user/<int:user_id>', methods=['GET'])
@login_required
def get_user_submissions(user_id):
    """Get all submissions for a specific user"""
    try:
        from models import Club, ClubMembership

        # Validate that the requested user_id matches the current user
        # or current user is an admin/club leader
        is_authorized = False

        if user_id == current_user.id or current_user.is_admin:
            is_authorized = True
        else:
            # Check if current user is a club leader
            led_clubs = Club.query.filter_by(leader_id=current_user.id).all()
            for club in led_clubs:
                # Check if requested user is a member of this club
                membership = ClubMembership.query.filter_by(
                    club_id=club.id,
                    user_id=user_id
                ).first()
                if membership:
                    is_authorized = True
                    break

            # Check if current user is a co-leader
            if not is_authorized:
                coleader_memberships = ClubMembership.query.filter_by(
                    user_id=current_user.id,
                    role='co-leader'
                ).all()

                for membership in coleader_memberships:
                    # Check if requested user is a member of this club
                    user_membership = ClubMembership.query.filter_by(
                        club_id=membership.club_id,
                        user_id=user_id
                    ).first()
                    if user_membership:
                        is_authorized = True
                        break

        if not is_authorized:
            return jsonify({'success': False, 'message': 'Unauthorized to view these submissions'}), 403

        # We no longer store submissions locally, so return an empty list
        # You could implement an Airtable fetch here if needed in the future
        return jsonify({
            'success': True,
            'submissions': []
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Error fetching submissions: {str(e)}'}), 500

@pizza_grants_bp.route('/club/<int:club_id>', methods=['GET'])
@login_required
def get_club_submissions(club_id):
    """Get all submissions for a specific club"""
    try:
        # TODO: Check if current user is club leader or admin

        # Load all submissions
        all_submissions = load_submissions()

        # Filter submissions for the requested club
        club_submissions = [s for s in all_submissions if s.get('club_id') == club_id]

        return jsonify({
            'success': True,
            'submissions': club_submissions
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error fetching club submissions: {str(e)}'}), 500

@pizza_grants_bp.route('/status/<int:submission_id>', methods=['PUT'])
@login_required
def update_submission_status(submission_id):
    """Update the status of a submission (admin/leader only)"""
    try:
        data = request.get_json()

        if 'status' not in data:
            return jsonify({'success': False, 'message': 'Status is required'}), 400

        # Valid statuses
        valid_statuses = ['pending', 'approved', 'rejected']
        if data['status'] not in valid_statuses:
            return jsonify({'success': False, 'message': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'}), 400

        # TODO: Check if current user is a club leader or admin

        # Load all submissions
        submissions = load_submissions()

        # Find and update the submission
        submission_found = False
        for submission in submissions:
            if submission.get('id') == submission_id:
                submission['status'] = data['status']
                if 'feedback' in data:
                    submission['feedback'] = data['feedback']
                submission_found = True
                break

        if not submission_found:
            return jsonify({'success': False, 'message': 'Submission not found'}), 404

        # Save updated submissions
        save_submissions(submissions)

        return jsonify({
            'success': True,
            'message': 'Submission status updated successfully'
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error updating submission status: {str(e)}'}), 500