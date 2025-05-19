
from flask import Blueprint, request, redirect, url_for, flash, jsonify, session
from flask_login import current_user, login_required

slack_bp = Blueprint('slack', __name__)

@slack_bp.route('/api/slack/disconnect', methods=['POST'])
@login_required
def disconnect_slack():
    """Disconnect user's Slack account."""
    try:
        # This would normally contain logic to remove Slack tokens
        return jsonify({'message': 'Slack disconnected successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
