from flask import Blueprint, jsonify, request, render_template, current_app
from flask_login import login_required, current_user
import requests
import json
import os
import time
from datetime import datetime
from models import db, UserUpload, User
from sqlalchemy import desc
import mimetypes

cdn_bp = Blueprint('cdn', __name__, url_prefix='/cdn')

@cdn_bp.route('/')
@login_required
def cdn_page():
    """Render the CDN file management page"""
    return render_template('cdn.html')

@cdn_bp.route('/upload', methods=['POST'])
@login_required
def upload_files():
    """Handle file uploads to the Hack Club CDN"""
    if 'files' not in request.files:
        return jsonify({'success': False, 'message': 'No files provided'})

    files = request.files.getlist('files')

    if len(files) == 0:
        return jsonify({'success': False, 'message': 'No files provided'})

    # Hardcoded API token
    api_token = "beans"

    # Prepare URLs for the CDN API
    file_urls = []

    # The Hack Club CDN API needs accessible URL references to files
    # In a production environment, you would upload files to a temporary
    # storage and provide the public URLs to the CDN API
    
    # Since we don't have that set up here, this won't work in production
    # But it demonstrates the correct format for the API request
    for file in files:
        if file.filename == '':
            continue

        try:
            # In a real implementation, you would:
            # 1. Save file to temporary storage
            # 2. Get a public URL for that file
            # 3. Add that URL to file_urls array
            
            # For testing purposes, we'll use example URLs
            # This is just for demonstration - it won't actually work
            file_urls.append(f"https://example.com/{file.filename}")
        except Exception as e:
            current_app.logger.error(f"Error processing file {file.filename}: {str(e)}")
            return jsonify({'success': False, 'message': f'Error processing file {file.filename}'})

    if len(file_urls) == 0:
        return jsonify({'success': False, 'message': 'No valid files to upload'})

    try:
        # Make request to the Hack Club CDN API v2
        response = requests.post(
            'https://cdn.hackclub.com/api/v2/new',
            headers={
                'Authorization': f'Bearer {api_token}',
                'Content-Type': 'application/json'
            },
            json=file_urls,  # Array of URLs to upload
            timeout=60  # Longer timeout for large files
        )

        if response.status_code != 200:
            current_app.logger.error(f"CDN API error: {response.status_code} - {response.text}")
            return jsonify({'success': False, 'message': f'CDN API error: {response.status_code}'})

        # Process the CDN response (v2 returns a dict with filenames as keys)
        cdn_response = response.json()

        # Save the uploaded files information to database
        for i, file in enumerate(files):
            if file.filename == '':
                continue
                
            # Get basename from the URL
            filename = file.filename
            
            # Skip if filename is not in the response
            if filename not in cdn_response:
                continue
                
            cdn_url = cdn_response[filename]
            file_size = file.content_length
            file_type = file.content_type or mimetypes.guess_type(file.filename)[0]

            # Create database record
            upload = UserUpload(
                user_id=current_user.id,
                filename=filename,
                original_filename=file.filename,
                file_type=file_type,
                file_size=file_size,
                cdn_url=cdn_url,
                sha=""  # v2 API doesn't return SHA values
            )

            db.session.add(upload)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Files uploaded successfully',
            'files': cdn_response['files']
        })

    except Exception as e:
        current_app.logger.error(f"Error in CDN upload: {str(e)}")
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error uploading to CDN: {str(e)}'})

@cdn_bp.route('/files')
@login_required
def get_user_files():
    """Get all files uploaded by the current user"""
    try:
        uploads = UserUpload.query.filter_by(user_id=current_user.id)\
            .order_by(desc(UserUpload.uploaded_at))\
            .all()

        files = []
        for upload in uploads:
            files.append({
                'id': upload.id,
                'filename': upload.filename,
                'original_filename': upload.original_filename,
                'file_type': upload.file_type,
                'file_size': upload.file_size,
                'cdn_url': upload.cdn_url,
                'uploaded_at': upload.uploaded_at.isoformat(),
                'sha': upload.sha
            })

        return jsonify({
            'success': True,
            'files': files
        })
    except Exception as e:
        current_app.logger.error(f"Error getting user files: {str(e)}")
        return jsonify({'success': False, 'message': f'Error getting files: {str(e)}'})

@cdn_bp.route('/files/<int:file_id>/delete', methods=['POST'])
@login_required
def delete_file(file_id):
    """Delete a file from the user's uploads"""
    try:
        upload = UserUpload.query.get_or_404(file_id)

        # Check if the file belongs to the current user
        if upload.user_id != current_user.id:
            return jsonify({'success': False, 'message': 'You do not have permission to delete this file'}), 403

        # Delete the file record from the database
        db.session.delete(upload)
        db.session.commit()

        # Note: The actual file on the CDN cannot be deleted through the API
        # It would remain on the CDN, but the reference to it is removed from our database

        return jsonify({
            'success': True,
            'message': 'File deleted successfully'
        })
    except Exception as e:
        current_app.logger.error(f"Error deleting file {file_id}: {str(e)}")
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error deleting file: {str(e)}'})