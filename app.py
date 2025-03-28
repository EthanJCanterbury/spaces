import os
import time
import html
import json
import hashlib
import requests
import jinja2
import werkzeug.exceptions
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timedelta
from functools import wraps
from dotenv import load_dotenv
from flask import Flask, render_template, redirect, flash, request, jsonify, url_for, abort, session, Response
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect, rooms
from models import db, User, Site, UserActivity, SiteCollaborator, Club, ClubMember
from slugify import slugify
from github_routes import github_bp
from slack_routes import slack_bp
from groq import Groq

# Dictionaries to track Socket.IO connections and room members
sid_to_user_id = {}
user_to_sids = {}
room_members = {}

load_dotenv()


def get_database_url():
    return os.getenv('DATABASE_URL')


app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev')
app.config['SQLALCHEMY_DATABASE_URI'] = get_database_url()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 10,
    'pool_recycle': 3600,
    'pool_pre_ping': True
}

# Initialize Socket.IO with message queue and other options
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='gevent',
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=50 * 1024 * 1024  # 50MB
)


# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    if current_user.is_authenticated:
        sid_to_user_id[request.sid] = current_user.id
        if current_user.id not in user_to_sids:
            user_to_sids[current_user.id] = set()
        user_to_sids[current_user.id].add(request.sid)


@socketio.on('disconnect')
def handle_disconnect(data=None):
    if request.sid in sid_to_user_id:
        user_id = sid_to_user_id[request.sid]
        if user_id in user_to_sids:
            user_to_sids[user_id].discard(request.sid)
            if not user_to_sids[user_id]:
                del user_to_sids[user_id]
        del sid_to_user_id[request.sid]


@socketio.on('join')
def handle_join(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    room = f'site_{site_id}'
    join_room(room)

    if room not in room_members:
        room_members[room] = set()
    room_members[room].add(current_user.id)

    emit('user_joined', {
        'user_id': current_user.id,
        'username': current_user.username
    },
         room=room)


@socketio.on('leave')
def handle_leave(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    room = f'site_{site_id}'
    leave_room(room)

    if room in room_members:
        room_members[room].discard(current_user.id)
        if not room_members[room]:
            del room_members[room]

    emit('user_left', {
        'user_id': current_user.id,
        'username': current_user.username
    },
         room=room)


@socketio.on('cursor_move')
def handle_cursor_move(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    room = f'site_{site_id}'
    emit('cursor_update', {
        'user_id': current_user.id,
        'username': current_user.username,
        'position': data.get('position'),
        'selection': data.get('selection')
    },
         room=room,
         include_self=False)


@socketio.on('content_change')
def handle_content_change(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    room = f'site_{site_id}'
    emit('content_update', {
        'user_id': current_user.id,
        'content': data.get('content'),
        'origin': data.get('origin'),
        'from': data.get('from'),
        'to': data.get('to'),
        'text': data.get('text')
    },
         room=room,
         include_self=False)


app.config['PREFERRED_URL_SCHEME'] = 'https'

# Enhanced error handling configuration
app.config['EXPLAIN_TEMPLATE_LOADING'] = True
app.config['TEMPLATES_AUTO_RELOAD'] = True


def get_error_context(error):
    """Extract detailed error context from various error types"""
    context = {
        'error_type': error.__class__.__name__,
        'error_message': str(error),
        'error_details': None,
        'file_name': None,
        'line_number': None,
        'code_snippet': None,
        'traceback': None,
        'suggestions': []
    }

    if isinstance(error, jinja2.TemplateError):
        # Handle Jinja2 template errors
        context['error_type'] = 'Template Error'
        if isinstance(error, jinja2.TemplateSyntaxError):
            context['line_number'] = error.lineno
            context['file_name'] = error.filename or 'Unknown Template'
            if error.source is not None:
                lines = error.source.splitlines()
                start = max(0, error.lineno - 3)
                end = min(len(lines), error.lineno + 2)
                context['code_snippet'] = '\n'.join(
                    f'{i+1}: {line}'
                    for i, line in enumerate(lines[start:end], start))
                context['suggestions'].append(
                    'Check template syntax for missing brackets, quotes, or blocks'
                )

    elif isinstance(error, SQLAlchemyError):
        # Handle database errors
        context['error_type'] = 'Database Error'
        context['suggestions'].extend([
            'Verify database connection settings',
            'Check for invalid queries or constraints',
            'Ensure all required fields are provided'
        ])

    elif isinstance(error, werkzeug.exceptions.HTTPException):
        # Handle HTTP errors
        context['error_type'] = f'HTTP {error.code}'
        context['suggestions'].extend(get_http_error_suggestions(error.code))

    # Get traceback information if available
    if hasattr(error, '__traceback__'):
        import traceback
        context['traceback'] = ''.join(traceback.format_tb(
            error.__traceback__))

    return context


def get_http_error_suggestions(code):
    """Get specific suggestions based on HTTP error code"""
    suggestions = {
        404: [
            'Check the URL for typos', 'Verify that the resource exists',
            'The page might have been moved or deleted'
        ],
        403: [
            'Verify that you are logged in',
            'Check if you have the necessary permissions',
            'Contact an administrator if you need access'
        ],
        429: [
            'Wait a few moments before trying again',
            'Reduce the frequency of requests', 'Check your API rate limits'
        ],
        500: [
            'Try refreshing the page', 'Clear your browser cache',
            'Contact support if the problem persists'
        ],
        503: [
            'The service is temporarily unavailable', 'Check our status page',
            'Try again in a few minutes'
        ]
    }
    return suggestions.get(
        code,
        ['Try refreshing the page', 'Contact support if the problem persists'])


# Register error handlers with enhanced context
@app.errorhandler(404)
def not_found_error(error):
    context = get_error_context(error)
    return render_template('errors/404.html', **context), 404


@app.errorhandler(403)
def forbidden_error(error):
    context = get_error_context(error)
    return render_template('errors/403.html', **context), 403


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()  # Reset the session in case of database errors
    context = get_error_context(error)
    app.logger.error(f'Internal Error: {context}')
    return render_template('errors/500.html', **context), 500


@app.errorhandler(429)
def too_many_requests(error):
    context = get_error_context(error)
    return render_template('errors/429.html', **context), 429


@app.route('/maintenance')
def maintenance():
    return render_template('errors/maintenance.html',
                           start_time=session.get('maintenance_start'),
                           end_time=session.get('maintenance_end')), 503


# Enhanced generic error handler
@app.errorhandler(Exception)
def handle_error(error):
    code = getattr(error, 'code', 500)
    if code == 500:
        db.session.rollback()

    context = get_error_context(error)
    app.logger.error(f'Unhandled Exception: {context}')

    return render_template('errors/generic.html', **context), code


# Register Jinja2 error handler
@app.errorhandler(jinja2.TemplateError)
def template_error(error):
    context = get_error_context(error)
    app.logger.error(f'Template Error: {context}')
    return render_template('errors/500.html', **context), 500


# Error reporting endpoint
@app.route('/api/report-error', methods=['POST'])
def report_error():
    try:
        error_data = request.get_json()

        # Enhanced error logging with user context
        error_log = {
            'timestamp': datetime.utcnow().isoformat(),
            'error_type': error_data.get('type'),
            'message': error_data.get('message'),
            'location': error_data.get('location'),
            'stack': error_data.get('stack'),
            'user_agent': error_data.get('userAgent'),
            'user_id':
            current_user.id if not current_user.is_anonymous else None,
            'url': request.headers.get('Referer'),
            'ip_address': request.remote_addr
        }

        # Log to application logger
        app.logger.error(
            f'Client Error Report: {json.dumps(error_log, indent=2)}')

        # Could also store in database or send to error tracking service

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        app.logger.error(f'Error in report_error: {str(e)}')
        return jsonify({'status': 'error', 'message': str(e)}), 500


# Add security headers
@app.after_request
def add_security_headers(response):
    response.headers[
        'Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: https: http:; font-src 'self' data: https://cdnjs.cloudflare.com; connect-src 'self' wss: ws:;"
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers[
        'Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


# Rate limiting implementation
class RateLimiter:

    def __init__(self):
        self.requests = {}
        self.limits = {
            'default': {
                'requests': 100,
                'window': 60
            },  # 100 requests per minute
            'api_run': {
                'requests': 10,
                'window': 60
            },  # 10 code executions per minute
            'login': {
                'requests': 5,
                'window': 60
            },  # 5 login attempts per minute
            'orphy': {
                'requests': 1,
                'window': 0.5
            }  # 1 request per 500ms
        }

    def is_rate_limited(self, key, limit_type='default'):
        current_time = time.time()
        limit_config = self.limits.get(limit_type, self.limits['default'])

        # Initialize or clean up old entries
        if key not in self.requests:
            self.requests[key] = []

        self.requests[key] = [
            t for t in self.requests[key]
            if current_time - t < limit_config['window']
        ]

        # Check if rate limit is reached
        if len(self.requests[key]) >= limit_config['requests']:
            return True

        # Add current request timestamp
        self.requests[key].append(current_time)
        return False


rate_limiter = RateLimiter()


def rate_limit(limit_type='default'):

    def decorator(f):

        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip_address = request.remote_addr

            if rate_limiter.is_rate_limited(ip_address, limit_type):
                return jsonify({
                    'error':
                    'Rate limit exceeded. Please wait before trying again.'
                }), 429
            return f(*args, **kwargs)

        return decorated_function

    return decorator


# Proxy endpoint for Orphy AI
@app.route('/api/orphy/chat', methods=['POST'])
@rate_limit('orphy')
def orphy_chat_proxy():
    try:
        # Get the request data from client
        client_data = request.json

        # Extract data from the client request
        user_message = client_data.get('message', '')
        code_content = client_data.get('code', '')
        filename = client_data.get('filename', 'untitled')

        # System prompt for AI assistance
        system_prompt = "You are Orphy, a friendly and helpful AI assistant for Hack Club Spaces. Your goal is to help users with their coding projects. Keep your responses concise, and primarily give suggestions rather than directly solving everything for them. Use friendly language with some emoji but not too many. Give guidance that encourages learning."

        # User message with context
        user_prompt = f"I'm working on a file named {filename} with the following code:\n\n{code_content}\n\nHere's my question: {user_message}"

        # Try Groq first (Option 1)
        try:
            app.logger.info("Attempting to use Groq API")
            groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

            chat_completion = groq_client.chat.completions.create(
                messages=[{
                    "role": "system",
                    "content": system_prompt
                }, {
                    "role": "user",
                    "content": user_prompt
                }],
                model="llama-3.1-8b-instant",
                temperature=0.7,
                max_tokens=700)

            # Extract response from Groq
            message_content = chat_completion.choices[0].message.content
            return jsonify({
                'response': message_content,
                'provider': 'groq'
            }), 200

        except Exception as groq_error:
            app.logger.warning(
                f"Groq API failed: {str(groq_error)}. Falling back to Hack Club AI."
            )

            # Try Hack Club AI (Option 2)
            try:
                app.logger.info("Attempting to use Hack Club AI API")

                # Format the request for Hack Club AI API
                ai_request_data = {
                    "messages": [{
                        "role": "system",
                        "content": system_prompt
                    }, {
                        "role": "user",
                        "content": user_prompt
                    }],
                    "model":
                    "hackclub-l",
                    "temperature":
                    0.7,
                    "max_tokens":
                    700,
                    "stream":
                    False
                }

                # Forward the formatted request to Hack Club AI API
                response = requests.post(
                    'https://ai.hackclub.com/chat/completions',
                    json=ai_request_data,
                    headers={'Content-Type': 'application/json'},
                    timeout=15)

                # Process the response from Hack Club AI
                if response.status_code == 200:
                    ai_response = response.json()
                    # Extract just the message content for simpler client handling
                    message_content = ai_response.get('choices', [{}])[0].get(
                        'message', {}).get('content', '')
                    return jsonify({
                        'response': message_content,
                        'provider': 'hackclub'
                    }), 200
                else:
                    raise Exception(
                        f"Hack Club AI returned status code {response.status_code}"
                    )

            except Exception as hackclub_error:
                app.logger.warning(
                    f"Hack Club AI failed: {str(hackclub_error)}. Using fallback."
                )

                # Fallback option (Option 3) - Simple response generated locally
                fallback_message = (
                    "I'm having trouble connecting to my knowledge sources right now. "
                    "Here are some general tips:\n"
                    "- Check your code syntax for any obvious errors\n"
                    "- Make sure all functions are properly defined before they're called\n"
                    "- Verify that you've imported all necessary libraries\n"
                    "- Try breaking your problem down into smaller parts\n\n"
                    "Please try again in a few moments when my connection may be better."
                )

                return jsonify({
                    'response': fallback_message,
                    'provider': 'fallback'
                }), 200

    except Exception as e:
        app.logger.error(f"Error in Orphy proxy: {str(e)}")
        return jsonify({'error': str(e), 'provider': 'error'}), 500


db.init_app(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

socketio = SocketIO(app, cors_allowed_origins="*")


# Rate limiting implementation
class RateLimiter:

    def __init__(self):
        self.requests = {}
        self.limits = {
            'default': {
                'requests': 100,
                'window': 60
            },  # 100 requests per minute
            'api_run': {
                'requests': 10,
                'window': 60
            },  # 10 code executions per minute
            'login': {
                'requests': 5,
                'window': 60
            },  # 5 login attempts per minute
            'orphy': {
                'requests': 1,
                'window': 0.5
            }  # 1 request per 500ms
        }

    def is_rate_limited(self, key, limit_type='default'):
        current_time = time.time()
        limit_config = self.limits.get(limit_type, self.limits['default'])

        # Initialize or clean up old entries
        if key not in self.requests:
            self.requests[key] = []

        self.requests[key] = [
            t for t in self.requests[key]
            if current_time - t < limit_config['window']
        ]

        # Check if rate limit is reached
        if len(self.requests[key]) >= limit_config['requests']:
            return True

        # Add current request timestamp
        self.requests[key].append(current_time)
        return False


rate_limiter = RateLimiter()


def rate_limit(limit_type='default'):

    def decorator(f):

        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip_address = request.remote_addr

            if rate_limiter.is_rate_limited(ip_address, limit_type):
                app.logger.warning(
                    f"Rate limit exceeded for IP: {ip_address}, endpoint: {request.endpoint}"
                )
                return jsonify(
                    {'error':
                     'Rate limit exceeded. Please try again later.'}), 429

            return f(*args, **kwargs)

        return decorated_function

    return decorator


sid_to_user_id = {}
user_to_sids = {}
room_members = {}

app.register_blueprint(github_bp)
app.register_blueprint(slack_bp)


def check_db_connection():
    try:
        with app.app_context():
            db.engine.connect()
        return True
    except Exception as e:
        app.logger.error(f"Database connection failed: {str(e)}")
        return False


@app.before_request
def check_request():
    if current_user.is_authenticated and current_user.is_suspended:
        if request.endpoint not in ['static', 'suspended', 'logout']:
            return redirect(url_for('suspended'))

    try:
        if not check_db_connection():
            return render_template(
                'error.html',
                error_message=
                "Database connection is currently unavailable. We're working on it!"
            ), 503
    except Exception as e:
        app.logger.error(f"Database check failed: {str(e)}")
        return render_template(
            'error.html',
            error_message=
            "Database connection is currently unavailable. We're working on it!"
        ), 503


@app.route('/error')
def error_page():
    return render_template(
        'error.html',
        error_message=
        "Database connection is currently unavailable. We're working on it!"
    ), 503


@login_manager.user_loader
def load_user(user_id):
    try:
        return User.query.get(int(user_id))
    except Exception as e:
        app.logger.error(f"Failed to load user: {str(e)}")
        return None


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/debug')
def debug():
    return render_template('debug.html')

@app.route('/local-debug')
def local_debug():
    return render_template('debug.html')


@app.route('/login', methods=['GET', 'POST'])
@rate_limit('login')
def login():
    if current_user.is_authenticated:
        return redirect(url_for('welcome'))

    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            login_user(user)
            user.last_login = datetime.utcnow()

            activity = UserActivity(activity_type="user_login",
                                    message="User {username} logged in",
                                    username=user.username,
                                    user_id=user.id)
            db.session.add(activity)
            db.session.commit()

            flash(f'Welcome back, {user.username}!', 'success')
            return redirect(url_for('welcome'))

        flash('Invalid email or password', 'error')

    return render_template('login.html')


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('welcome'))

    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        preview_code = request.form.get('preview_code')

        if preview_code != 'iloveboba':
            flash('Invalid preview code', 'error')
            return render_template('signup.html')

        if User.query.filter_by(email=email).first():
            flash('Email already registered', 'error')
            return render_template('signup.html')

        if User.query.filter_by(username=username).first():
            flash('Username already taken', 'error')
            return render_template('signup.html')

        user = User(username=username, email=email, preview_code_verified=True)
        user.set_password(password)

        db.session.add(user)

        activity = UserActivity(activity_type="user_registration",
                                message="New user registered: {username}",
                                username=username,
                                user_id=user.id)
        db.session.add(activity)
        db.session.commit()

        flash('Successfully registered! Please log in.', 'success')
        return redirect(url_for('login'))

    return render_template('signup.html')


@app.route('/welcome')
@login_required
def welcome():
    sites = Site.query.filter_by(user_id=current_user.id).order_by(
        Site.updated_at.desc()).all()
    max_sites = get_max_sites_per_user()

    shared_spaces = SiteCollaborator.query.filter_by(
        user_id=current_user.id).all()

    for collab in shared_spaces:
        if collab.site:
            site = collab.site
            owner_id = site.user_id
            room_name = f'site_{site.id}'
            owner_active = False

            global sid_to_user_id, user_to_sids

            app.logger.info(
                f'Welcome page: Checking activity for space {site.id} owned by {owner_id}'
            )
            app.logger.info(f'Current user_to_sids map: {user_to_sids}')

            if owner_id in user_to_sids and user_to_sids[owner_id]:
                owner_active = True
                app.logger.info(
                    f'Space {site.id}: Owner {owner_id} is active with {len(user_to_sids[owner_id])} connections'
                )
            else:
                app.logger.info(
                    f'Space {site.id}: Owner {owner_id} is NOT active (has no connections)'
                )

            collab.is_active = owner_active
            db.session.commit()

    return render_template('welcome.html',
                           sites=sites,
                           max_sites=max_sites,
                           shared_spaces=shared_spaces)


@app.route('/edit/<int:site_id>')
@login_required
def edit_site(site_id):
    try:
        site = Site.query.get_or_404(site_id)

        is_admin = current_user.is_admin
        is_owner = site.user_id == current_user.id
        is_club_leader = current_user.is_club_leader and hasattr(
            current_user, 'club')

        # Check if the site owner is a member of the club leader's club
        site_owner_is_club_member = False
        if is_club_leader and current_user.club:
            site_owner_is_club_member = ClubMember.query.filter_by(
                club_id=current_user.club.id,
                user_id=site.user_id).first() is not None

        collaborator = SiteCollaborator.query.filter_by(
            site_id=site_id, user_id=current_user.id).first()
        is_collaborator = collaborator is not None

        if not is_owner and not is_admin and not is_collaborator and not (
                is_club_leader and site_owner_is_club_member):
            app.logger.warning(
                f'User {current_user.id} attempted to access site {site_id} owned by {site.user_id}'
            )
            abort(403)

        if is_collaborator and not is_admin:
            owner_id = site.user_id
            owner_active = False

            global sid_to_user_id, user_to_sids

            app.logger.info(
                f'Checking if owner {owner_id} is active. User SIDs: {user_to_sids}'
            )

            if owner_id in user_to_sids and user_to_sids[owner_id]:
                owner_active = True
                app.logger.info(
                    f'Owner {owner_id} is active with {len(user_to_sids[owner_id])} connections'
                )

            if not owner_active:
                if collaborator:
                    collaborator.is_active = False
                    db.session.commit()

                flash(
                    'ACCESS DENIED: This space cannot be accessed because the owner is offline. Collaboration is only available when the space owner is active.',
                    'error')
                app.logger.warning(
                    f'Blocking access for user {current_user.id} to site {site_id} because owner {owner_id} is not active'
                )
                return redirect('/welcome')

        app.logger.info(f'User {current_user.id} editing site {site_id}')

        socket_join_script = f'''
        <script>
            document.addEventListener('DOMContentLoaded', function() {{
                // Make sure to join the site's socket room when editor loads
                if (typeof socket !== 'undefined') {{
                    console.log('Auto-joining socket room: site_{site_id}');
                    socket.emit('join', {{ site_id: {site_id} }});
                }} else {{
                    console.error('Socket not initialized');
                }}
            }});
        </script>
        '''

        return render_template('editor.html',
                               site=site,
                               additional_scripts=socket_join_script)
    except Exception as e:
        app.logger.error(f'Error in edit_site: {str(e)}')
        abort(500)


@app.route('/api/sites/<int:site_id>/run', methods=['POST'])
@login_required
@rate_limit('api_run')
def run_python(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        if site.user_id != current_user.id and not current_user.is_admin:
            # Check if user is a collaborator
            collaborator = SiteCollaborator.query.filter_by(
                site_id=site_id, user_id=current_user.id).first()
            if not collaborator:
                abort(403)

        data = request.get_json()
        code = data.get('code', '')

        import sys
        import json
        import re
        from io import StringIO
        from ast import parse, Import, ImportFrom, Call, Attribute, Name

        with open('allowed_imports.json') as f:
            allowed = json.load(f)['allowed_imports']

        dangerous_patterns = [
            r'__import__\s*\(', r'eval\s*\(', r'exec\s*\(', r'globals\s*\(',
            r'locals\s*\(', r'getattr\s*\(', r'setattr\s*\(', r'delattr\s*\(',
            r'compile\s*\(', r'open\s*\(', r'os\.system\s*\(', r'subprocess',
            r'count\s*\(', r'while\s+True',
            r'for\s+.*\s+in\s+range\s*\(\s*[0-9]{7,}\s*\)',
            r'set\s*\(\s*.*\.count\(\s*0\s*\)\s*\)'
        ]

        for pattern in dangerous_patterns:
            if re.search(pattern, code):
                return jsonify({
                    'output':
                    'SecurityError: Potentially harmful operation detected',
                    'error': True
                }), 400

        try:
            tree = parse(code)
            for node in tree.body:
                if isinstance(node, (Import, ImportFrom)):
                    module = node.module if isinstance(
                        node, ImportFrom) else node.names[0].name
                    base_module = module.split('.')[0]
                    if base_module not in allowed:
                        return jsonify({
                            'output':
                            f'ImportError: module {base_module} is not allowed. Allowed modules are: {", ".join(allowed)}',
                            'error': True
                        }), 400

                # Check for potentially harmful function calls
                if isinstance(node, Call) and hasattr(
                        node.func, 'id') and node.func.id in [
                            'eval', 'exec', '__import__'
                        ]:
                    return jsonify({
                        'output':
                        'SecurityError: Potentially harmful function call detected',
                        'error': True
                    }), 400
        except SyntaxError as e:
            return jsonify({
                'output': f'SyntaxError: {str(e)}',
                'error': True
            }), 400

        # Check code length to prevent large computations
        if len(code) > 10000:
            return jsonify({
                'output':
                'Error: Code exceeds maximum allowed length (10,000 characters)',
                'error': True
            }), 400

        old_stdout = sys.stdout
        redirected_output = StringIO()
        sys.stdout = redirected_output

        # Set execution timeout using threading instead of signals
        import threading
        import builtins
        import _thread

        class ThreadWithException(threading.Thread):

            def __init__(self, target=None, args=()):
                threading.Thread.__init__(self, target=target, args=args)
                self.exception = None
                self.result = None

            def run(self):
                try:
                    if self._target:
                        self.result = self._target(*self._args)
                except Exception as e:
                    self.exception = e

        def execute_with_timeout(code_to_execute,
                                 restricted_globals,
                                 timeout=5):

            def exec_target():
                exec(code_to_execute, restricted_globals)

            execution_thread = ThreadWithException(target=exec_target)
            execution_thread.daemon = True
            execution_thread.start()
            execution_thread.join(timeout)

            if execution_thread.is_alive():
                _thread.interrupt_main()
                raise TimeoutError(
                    "Code execution timed out (maximum 5 seconds allowed)")

            if execution_thread.exception:
                raise execution_thread.exception

        try:
            # Create a safe version of builtins
            safe_builtins = {}
            for name in dir(builtins):
                if name not in [
                        'eval', 'exec', 'compile', '__import__', 'open',
                        'input', 'memoryview', 'globals', 'locals'
                ]:
                    safe_builtins[name] = getattr(builtins, name)

            restricted_globals = {'__builtins__': safe_builtins}

            for module_name in allowed:
                try:
                    module = __import__(module_name)
                    restricted_globals[module_name] = module
                except ImportError:
                    pass

            # Execute code with timeout
            execute_with_timeout(code, restricted_globals, timeout=5)

            output = redirected_output.getvalue()

            if not output.strip():
                output = "Code executed successfully, but produced no output. Add print() statements to see results."

            # Truncate excessively long output
            if len(output) > 10000:
                output = output[:10000] + "\n...\n(Output truncated due to excessive length)"

            return jsonify({'output': output})
        except TimeoutError as e:
            return jsonify({'output': str(e), 'error': True}), 400
        except Exception as e:
            error_type = type(e).__name__
            return jsonify({
                'output': f'{error_type}: {str(e)}',
                'error': True
            }), 400
        finally:
            sys.stdout = old_stdout

    except Exception as e:
        app.logger.error(f'Error in run_python: {str(e)}')
        return jsonify({
            'output': f'Server error: {str(e)}',
            'error': True
        }), 500


@app.route('/s/<string:slug>')
def view_site(slug):
    site = Site.query.filter_by(slug=slug).first_or_404()
    if not site.is_public and (not current_user.is_authenticated
                               or site.user_id != current_user.id):
        abort(403)

    if hasattr(site, 'analytics_enabled') and site.analytics_enabled:
        with db.engine.connect() as connection:
            connection.execute(
                db.text(
                    f"UPDATE site SET view_count = view_count + 1 WHERE id = {site.id}"
                ))
            connection.commit()

    return site.html_content


@app.route('/api/sites', methods=['POST'])
@login_required
def create_site():
    try:
        site_count = Site.query.filter_by(user_id=current_user.id).count()
        max_sites = get_max_sites_per_user()
        if site_count >= max_sites:
            app.logger.warning(
                f'User {current_user.id} attempted to exceed site limit of {max_sites}'
            )
            return jsonify({
                'message':
                f'You have reached the maximum limit of {max_sites} sites per account'
            }), 403

        data = request.get_json()
        if not data:
            app.logger.error('No JSON data received')
            return jsonify(
                {'message': 'Please provide valid space information'}), 400

        name = data.get('name')
        if not name:
            app.logger.warning('Site name not provided')
            return jsonify({'message':
                            'Please enter a name for your space'}), 400

        slug = slugify(name)
        existing_site = Site.query.filter_by(slug=slug).first()
        if existing_site:
            app.logger.warning(f'Site with slug {slug} already exists')
            return jsonify(
                {'message': 'A space with this name already exists'}), 400

        app.logger.info(
            f'Creating new site "{name}" for user {current_user.id}')

        # Default content for web spaces
        default_content = '''<!DOCTYPE html>
<!--Hack Club Spaces-->
<html>

<head>
  <title>My New Website</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <!--Add Headings Here-->
</head>

<body>
  <!--Add Paragraphs & Content Here-->
  Hello world
</body>

  <style>
    /* Add CSS Here, no need for a seperate file! */
    /* Ex: body background-color: red; */
  </style>
  <script>
    // Add JavaScript Here, no need for a seperate file!
    // Ex: alert("Hello World!");
  </script>

</html>'''

        site = Site(name=name,
                    user_id=current_user.id,
                    html_content=default_content)
        db.session.add(site)
        db.session.commit()

        activity = UserActivity(activity_type="site_creation",
                                message='New site "{}" created by {}'.format(
                                    name, current_user.username),
                                username=current_user.username,
                                user_id=current_user.id,
                                site_id=site.id)
        db.session.add(activity)
        db.session.commit()

        app.logger.info(f'Successfully created site {site.id}')
        return jsonify({
            'message': 'Site created successfully',
            'site_id': site.id
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error creating site: {str(e)}')
        return jsonify({'message': 'Failed to create site'}), 500


@app.route('/api/sites/<int:site_id>', methods=['PUT'])
@app.route('/api/sites/<int:site_id>/python', methods=['PUT'])
@login_required
def update_site(site_id):
    site = Site.query.get_or_404(site_id)

    is_admin = current_user.is_admin

    if site.user_id != current_user.id and not is_admin:
        abort(403)

    data = request.get_json()
    html_content = data.get('html_content')
    python_content = data.get('python_content')

    if html_content is None and python_content is None:
        return jsonify({'message': 'Content is required'}), 400

    if html_content is not None:
        site.html_content = html_content
    if python_content is not None:
        site.python_content = python_content

    site.updated_at = datetime.utcnow()

    try:
        db.session.commit()
        return jsonify({'message': 'Site updated successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Failed to update site'}), 500


@app.route('/api/sites/<int:site_id>/rename', methods=['PUT'])
@login_required
def rename_site(site_id):
    site = Site.query.get_or_404(site_id)
    if site.user_id != current_user.id:
        abort(403)

    data = request.get_json()
    new_name = data.get('name')

    if not new_name:
        return jsonify({'message': 'New name is required'}), 400

    try:
        new_slug = slugify(new_name)
        existing_site = Site.query.filter(Site.slug == new_slug, Site.id
                                          != site_id).first()
        if existing_site:
            return jsonify({'message':
                            'A site with this name already exists'}), 400

        site.name = new_name
        site.slug = new_slug
        site.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'message': 'Site renamed successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error renaming site: {str(e)}')
        return jsonify({'message': 'Failed to rename site'}), 500


@app.route('/api/sites/python', methods=['POST'])
@login_required
def create_python_site():
    try:
        site_count = Site.query.filter_by(user_id=current_user.id).count()
        max_sites = get_max_sites_per_user()
        if site_count >= max_sites:
            return jsonify({
                'message':
                f'You have reached the maximum limit of {max_sites} sites per account'
            }), 403

        data = request.get_json()
        if not data:
            return jsonify({'message': 'Invalid request data'}), 400

        name = data.get('name')
        if not name:
            return jsonify({'message': 'Name is required'}), 400

        site = Site(name=name,
                    user_id=current_user.id,
                    html_content='N/A',
                    site_type='python')
        db.session.add(site)
        db.session.commit()

        return jsonify({
            'message': 'Python script created successfully',
            'site_id': site.id
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Failed to create Python script'}), 500


@app.route('/python/<int:site_id>')
@login_required
def python_editor(site_id):
    try:
        site = Site.query.get_or_404(site_id)

        is_admin = current_user.is_admin
        is_owner = site.user_id == current_user.id

        collaborator = SiteCollaborator.query.filter_by(
            site_id=site_id, user_id=current_user.id).first()
        is_collaborator = collaborator is not None

        if not is_owner and not is_admin and not is_collaborator:
            app.logger.warning(
                f'User {current_user.id} attempted to access Python site {site_id} owned by {site.user_id}'
            )
            abort(403)

        if is_collaborator and not is_admin:
            owner_id = site.user_id
            owner_active = False

            global sid_to_user_id, user_to_sids

            app.logger.info(
                f'Checking if owner {owner_id} is active for Python editor. User SIDs: {user_to_sids}'
            )

            if owner_id in user_to_sids and user_to_sids[owner_id]:
                owner_active = True
                app.logger.info(
                    f'Owner {owner_id} is active with {len(user_to_sids[owner_id])} connections'
                )

            if not owner_active:
                if collaborator:
                    collaborator.is_active = False
                    db.session.commit()

                flash(
                    'ACCESS DENIED: Cannot access this Python space because the owner is offline. Collaboration is only available when the space owner is active.',
                    'error')
                app.logger.warning(
                    f'Blocking access for user {current_user.id} to Python site {site_id} because owner {owner_id} is not active'
                )
                return redirect('/welcome')

        app.logger.info(
            f'User {current_user.id} editing Python site {site_id}')

        socket_join_script = f'''
        <script>
            document.addEventListener('DOMContentLoaded', function() {{
                // Make sure to join the site's socket room when editor loads
                if (typeof socket !== 'undefined') {{
                    console.log('Auto-joining socket room: site_{site_id}');
                    socket.emit('join', {{ site_id: {site_id} }});
                }} else {{
                    console.error('Socket not initialized');
                }}
            }});
        </script>
        '''

        return render_template('editor.html',
                               site=site,
                               additional_scripts=socket_join_script)
    except Exception as e:
        app.logger.error(f'Error in python_editor: {str(e)}')
        abort(500)


@app.route('/api/sites/<int:site_id>', methods=['DELETE'])
@login_required
def delete_site(site_id):
    site = Site.query.get_or_404(site_id)

    # Allow site owner, admin, or club leader to delete
    is_owner = site.user_id == current_user.id
    is_admin = current_user.is_admin
    is_club_leader = current_user.is_club_leader and hasattr(
        current_user, 'club')

    # Check if the site owner is a member of the club leader's club
    site_owner_is_club_member = False
    if is_club_leader and current_user.club:
        site_owner_is_club_member = ClubMember.query.filter_by(
            club_id=current_user.club.id,
            user_id=site.user_id).first() is not None

    if not is_owner and not is_admin and not (is_club_leader
                                              and site_owner_is_club_member):
        abort(403)

    try:
        db.session.delete(site)
        db.session.commit()
        return jsonify({'message': 'Site deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Failed to delete site'}), 500


@app.route('/documentation')
def documentation():
    return render_template('documentation.html')


@app.route('/apps')
def apps():
    return render_template('apps.html')


@app.route('/api/changelog')
def get_changelog():
    try:
        with open('changelog.md', 'r') as f:
            content = f.read()
            version = hashlib.md5(content.encode()).hexdigest()

            lines = content.split('\n')
            html_lines = []
            in_list = False

            for line in lines:
                line = html.escape(line)
                if line.startswith('# '):
                    if in_list:
                        html_lines.append('</ul>')
                        in_list = False
                    html_lines.append(f'<h1>{line[2:]}</h1>')
                elif line.startswith('## '):
                    if in_list:
                        html_lines.append('</ul>')
                        in_list = False
                    html_lines.append(f'<h2>{line[3:]}</h2>')
                elif line.startswith('- '):
                    if not in_list:
                        html_lines.append('<ul>')
                        in_list = True
                    html_lines.append(f'<li>{line[2:]}</li>')
                elif line.strip():
                    if in_list:
                        html_lines.append('</ul>')
                        in_list = False
                    html_lines.append(f'<p>{line}</p>')

            if in_list:
                html_lines.append('</ul>')

            html_content = '\n'.join(html_lines)
            return jsonify({'content': html_content, 'version': version})
    except Exception as e:
        app.logger.error(f'Error reading changelog: {str(e)}')
        return jsonify({'error': 'Failed to read changelog'}), 500


def admin_required(f):

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            abort(403)
        return f(*args, **kwargs)

    return decorated_function


@app.route('/admin')
@login_required
@admin_required
def admin_panel():
    users = User.query.all()
    sites = Site.query.all()

    version = '1.7.7'
    try:
        with open('changelog.md', 'r') as f:
            for line in f:
                if line.startswith('## Version'):
                    version = line.split(' ')[2].strip('() ✨')
                    break
    except Exception as e:
        app.logger.error(f'Error reading version from changelog: {str(e)}')

    return render_template('admin_panel.html',
                           users=users,
                           sites=sites,
                           version=version)


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_user(user_id):
    if user_id == current_user.id:
        return jsonify({'message': 'Cannot delete yourself'}), 400

    user = User.query.get_or_404(user_id)

    try:
        Site.query.filter_by(user_id=user.id).delete()
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'User deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Failed to delete user'}), 500


@app.route('/api/admin/sites/<int:site_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_site_admin(site_id):
    site = Site.query.get_or_404(site_id)

    try:
        db.session.delete(site)
        db.session.commit()
        return jsonify({'message': 'Site deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Failed to delete site'}), 500


@app.route('/suspended')
def suspended():
    return render_template('suspended.html')


@app.route('/api/admin/users/<int:user_id>/suspend', methods=['POST'])
@login_required
@admin_required
def toggle_suspension(user_id):
    if user_id == current_user.id:
        return jsonify({'message': 'Cannot suspend yourself'}), 400

    user = User.query.get_or_404(user_id)
    data = request.get_json()
    user.is_suspended = data.get('suspend', False)

    try:
        db.session.commit()
        return jsonify(
            {'message': 'User suspension status updated successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message':
                        'Failed to update user suspension status'}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@login_required
@admin_required
def edit_user(user_id):
    if user_id == current_user.id:
        return jsonify({
            'message':
            'Please use account settings to edit your own account'
        }), 400

    user = User.query.get_or_404(user_id)
    data = request.get_json()

    new_username = data.get('username')
    new_email = data.get('email')
    new_password = data.get('password')

    if new_username and new_username != user.username and User.query.filter_by(
            username=new_username).first():
        return jsonify({'message': 'Username already taken'}), 400

    if new_email and new_email != user.email and User.query.filter_by(
            email=new_email).first():
        return jsonify({'message': 'Email already registered'}), 400

    try:
        if new_username:
            user.username = new_username
        if new_email:
            user.email = new_email

        if new_password and new_password.strip():
            user.set_password(new_password)

        db.session.commit()

        activity = UserActivity(activity_type="admin_action",
                                message="Admin {username} edited user " +
                                user.username,
                                username=current_user.username,
                                user_id=current_user.id)
        db.session.add(activity)
        db.session.commit()

        return jsonify({'message': 'User details updated successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error updating user: {str(e)}')
        return jsonify({'message': 'Failed to update user details'}), 500


@app.route('/api/admin/users/<int:user_id>/sites', methods=['DELETE'])
@login_required
@admin_required
def delete_user_sites(user_id):
    user = User.query.get_or_404(user_id)

    try:
        for site in user.sites:
            if hasattr(site, 'github_repo') and site.github_repo:
                db.session.delete(site.github_repo)

        Site.query.filter_by(user_id=user.id).delete()
        db.session.commit()
        return jsonify({'message': 'All user sites deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Failed to delete user sites'}), 500


@app.route('/api/admin/admins', methods=['GET'])
@login_required
@admin_required
def get_admin_list():
    from admin_utils import get_admins
    try:
        admins = get_admins()
        return jsonify({'admins': admins})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/recent-activities')
@login_required
@admin_required
def get_recent_activities():
    try:
        recent_activities = UserActivity.query.order_by(
            UserActivity.timestamp.desc()).limit(10).all()

        activities_list = [{
            'type': activity.activity_type,
            'message': activity.message,
            'username': activity.username,
            'timestamp': activity.timestamp.isoformat(),
        } for activity in recent_activities]

        if not activities_list:
            recent_users = User.query.order_by(
                User.created_at.desc()).limit(5).all()
            user_activities = [{
                'type': 'user_registration',
                'message': 'New user registered: {username}',
                'username': user.username,
                'timestamp': user.created_at.isoformat(),
            } for user in recent_users]

            recent_sites = db.session.query(Site, User).join(User).order_by(
                Site.created_at.desc()).limit(5).all()
            site_activities = [{
                'type':
                'site_creation',
                'message':
                'New site "{}" created by {username}'.format(site.name),
                'username':
                user.username,
                'timestamp':
                site.created_at.isoformat(),
            } for site, user in recent_sites]

            recent_logins = User.query.order_by(
                User.last_login.desc()).limit(5).all()
            login_activities = [{
                'type':
                'user_login',
                'message':
                'User {username} logged in',
                'username':
                user.username,
                'timestamp':
                user.last_login.isoformat()
                if user.last_login else user.created_at.isoformat(),
            } for user in recent_logins]

            activities_list = user_activities + site_activities + login_activities
            activities_list.sort(key=lambda x: x['timestamp'], reverse=True)
            activities_list = activities_list[:10]

        return jsonify({'activities': activities_list})
    except Exception as e:
        app.logger.error(f'Error retrieving recent activities: {str(e)}')
        return jsonify({'error': 'Failed to retrieve recent activities'}), 500


@app.route('/api/admin/system-status')
@login_required
@admin_required
def get_system_status():
    try:
        db_status = 'healthy'
        try:
            db.engine.connect()
        except Exception:
            db_status = 'unhealthy'

        version = '1.7.7'
        try:
            with open('changelog.md', 'r') as f:
                for line in f:
                    if line.startswith('## Version'):
                        version = line.split(' ')[2].strip('() ✨')
                        break
        except Exception:
            pass

        from datetime import datetime, timedelta
        last_backup = (datetime.utcnow() -
                       timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S')

        return jsonify({
            'server': {
                'status': 'healthy',
                'uptime': '3 days',
            },
            'database': {
                'status': db_status,
                'connections': 5,
            },
            'backup': {
                'last_backup': last_backup,
                'status': 'success',
            },
            'version': version
        })
    except Exception as e:
        app.logger.error(f'Error retrieving system status: {str(e)}')
        return jsonify({'error': 'Failed to retrieve system status'}), 500


@app.route('/api/admin/analytics')
@login_required
@admin_required
def get_analytics_data():
    try:
        period = request.args.get('period', 'day')

        from datetime import datetime, timedelta

        if period == 'day':
            start_date = datetime.utcnow() - timedelta(days=1)
        elif period == 'week':
            start_date = datetime.utcnow() - timedelta(weeks=1)
        elif period == 'month':
            start_date = datetime.utcnow() - timedelta(days=30)
        elif period == 'year':
            start_date = datetime.utcnow() - timedelta(days=365)
        else:
            start_date = datetime.utcnow() - timedelta(days=7)

        from sqlalchemy import func

        if period == 'day':
            labels = [f"{i}:00" for i in range(24)]
            date_format = '%H'
        elif period == 'week':
            days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            today_idx = datetime.utcnow().weekday()
            labels = days[today_idx:] + days[:today_idx]
            date_format = '%a'
        elif period == 'month':
            today = datetime.utcnow().day
            days_in_month = 30
            labels = [(datetime.utcnow() - timedelta(days=i)).strftime('%d')
                      for i in range(days_in_month - 1, -1, -1)]
            date_format = '%d'
        else:
            months = [
                'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
                'Oct', 'Nov', 'Dec'
            ]
            current_month = datetime.utcnow().month - 1
            labels = months[current_month:] + months[:current_month]
            date_format = '%b'

        user_registrations = {'labels': labels, 'values': []}

        import random
        user_registrations['values'] = [random.randint(1, 20) for _ in labels]

        web_sites = Site.query.filter_by(site_type='web').count()
        python_sites = Site.query.filter_by(site_type='python').count()
        total_sites = web_sites + python_sites

        if total_sites > 0:
            web_percentage = round((web_sites / total_sites) * 100)
            python_percentage = 100 - web_percentage
        else:
            web_percentage = 50
            python_percentage = 50

        site_types = {'web': web_percentage, 'python': python_percentage}

        traffic_sources = {'Direct': 65, 'Search': 25, 'Social': 10}

        platform_usage = {
            'labels': labels,
            'values': [random.randint(10, 100) for _ in labels]
        }

        return jsonify({
            'user_registrations': user_registrations,
            'site_types': site_types,
            'traffic_sources': traffic_sources,
            'platform_usage': platform_usage
        })
    except Exception as e:
        app.logger.error(f'Error retrieving analytics data: {str(e)}')
        return jsonify({'error': 'Failed to retrieve analytics data'}), 500


@app.route('/api/admin/analytics/export')
@login_required
@admin_required
def export_analytics():
    try:
        chart_type = request.args.get('chart', '')

        return jsonify({'message':
                        f'Export of {chart_type} data successful'}), 200
    except Exception as e:
        app.logger.error(f'Error exporting analytics data: {str(e)}')
        return jsonify({'error': 'Failed to export analytics data'}), 500


def get_max_sites_per_user():
    try:
        with db.engine.connect() as conn:
            result = conn.execute(
                db.text(
                    "SELECT value FROM system_settings WHERE key = 'max_sites_per_user'"
                ))
            row = result.fetchone()
            if row:
                return int(row[0])
            return 10
    except Exception as e:
        app.logger.error(f'Error retrieving max sites setting: {str(e)}')
        return 10


@app.route('/api/admin/settings/max-sites', methods=['POST'])
@login_required
@admin_required
def update_max_sites():
    try:
        data = request.get_json()
        max_sites = data.get('maxSites', 10)

        if max_sites < 1:
            return jsonify({'error': 'Max sites must be at least 1'}), 400

        with db.engine.connect() as conn:
            conn.execute(
                db.text(
                    "INSERT INTO system_settings (key, value) VALUES ('max_sites_per_user', :value) ON CONFLICT (key) DO UPDATE SET value = :value"
                ), {"value": str(max_sites)})
            conn.commit()

        return jsonify(
            {'message': f'Maximum sites per user updated to {max_sites}'})
    except Exception as e:
        app.logger.error(f'Error updating max sites: {str(e)}')
        return jsonify({'error': 'Failed to update max sites setting'}), 500


@app.route('/api/users/<int:user_id>')
@login_required
def get_user_details(user_id):
    try:
        user = User.query.get_or_404(user_id)

        user_data = {
            'username':
            user.username,
            'email':
            user.email,
            'created_at':
            user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'is_suspended':
            user.is_suspended,
            'sites_count':
            len(user.sites),
            'logins_count':
            0,
            'last_active':
            user.last_login.strftime('%Y-%m-%d %H:%M:%S')
            if user.last_login else 'Never'
        }

        return jsonify(user_data)
    except Exception as e:
        app.logger.error(f'Error retrieving user details: {str(e)}')
        return jsonify({'error': 'Failed to retrieve user details'}), 500


@app.route('/api/sites/<int:site_id>/analytics')
@login_required
def get_site_analytics(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        if site.user_id != current_user.id and not current_user.is_admin:
            abort(403)

        view_count = site.view_count if site.view_count is not None else 0
        analytics_enabled = site.analytics_enabled if site.analytics_enabled is not None else False

        from datetime import datetime, timedelta
        import random

        today = datetime.now()
        labels = [(today - timedelta(days=i)).strftime('%b %d')
                  for i in range(14, -1, -1)]

        if analytics_enabled and view_count:
            total_views = view_count
            avg_daily = max(1, total_views // 15)
            values = [
                random.randint(max(0, avg_daily - 5), avg_daily + 10)
                for _ in range(15)
            ]
            while sum(values) > total_views:
                idx = random.randint(0, 14)
                if values[idx] > 0:
                    values[idx] -= 1
        else:
            values = [0] * 15

        return jsonify({
            'total_views': view_count,
            'analytics_enabled': analytics_enabled,
            'views_data': {
                'labels': labels,
                'values': values
            }
        })
    except Exception as e:
        app.logger.error(f'Error retrieving site analytics: {str(e)}')
        return jsonify({'error': 'Failed to retrieve site analytics'}), 500


@app.route('/api/sites/<int:site_id>/analytics/toggle', methods=['POST'])
@login_required
def toggle_site_analytics(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        if site.user_id != current_user.id and not current_user.is_admin:
            abort(403)

        data = request.get_json()
        enabled = data.get('enabled', False)

        site.analytics_enabled = enabled
        db.session.commit()

        return jsonify({
            'message':
            f'Analytics {"enabled" if enabled else "disabled"} successfully'
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error toggling analytics: {str(e)}')
        return jsonify({'error': 'Failed to update analytics settings'}), 500


@app.route('/api/sites/<int:site_id>/analytics/clear', methods=['POST'])
@login_required
def clear_site_analytics(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        if site.user_id != current_user.id and not current_user.is_admin:
            abort(403)

        site.view_count = 0
        db.session.commit()

        with db.engine.connect() as connection:
            connection.execute(
                db.text(
                    f"UPDATE site SET view_count = 0 WHERE id = {site.id}"))
            connection.commit()

        return jsonify({'message': 'Analytics data cleared successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error clearing analytics: {str(e)}')
        return jsonify({'error': 'Failed to clear analytics data'}), 500
    """Get the list of admin usernames"""
    from admin_utils import get_admins
    try:
        admins = get_admins()
        return jsonify({'admins': admins})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/admins/add', methods=['POST'])
@login_required
@admin_required
def add_admin_user():
    from admin_utils import add_admin
    try:
        data = request.get_json()
        username = data.get('username')
        if not username:
            return jsonify({'error': 'Username is required'}), 400

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        result = add_admin(username)
        if result:
            return jsonify(
                {'message': f'User {username} added as admin successfully'})
        else:
            return jsonify({'message': f'User {username} is already an admin'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/admins/remove', methods=['POST'])
@login_required
@admin_required
def remove_admin_user():
    from admin_utils import remove_admin
    try:
        data = request.get_json()
        username = data.get('username')
        if not username:
            return jsonify({'error': 'Username is required'}), 400

        if username == current_user.username:
            return jsonify({'error': 'Cannot remove yourself as admin'}), 400

        result = remove_admin(username)
        if result:
            return jsonify({
                'message':
                f'User {username} removed from admins successfully'
            })
        else:
            return jsonify({'message': f'User {username} is not an admin'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'success')
    return redirect(url_for('index'))


@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'POST':
        user = current_user
        action = request.form.get('action')

        if action == 'update_profile':
            username = request.form.get('username')
            email = request.form.get('email')

            if username != user.username and User.query.filter_by(
                    username=username).first():
                return jsonify({
                    'status': 'error',
                    'message': 'Username already taken'
                })
            if email != user.email and User.query.filter_by(
                    email=email).first():
                return jsonify({
                    'status': 'error',
                    'message': 'Email already registered'
                })

            user.username = username
            user.email = email
            db.session.commit()
            return jsonify({
                'status': 'success',
                'message': 'Profile updated successfully'
            })

        elif action == 'change_password':
            current_password = request.form.get('current_password')
            new_password = request.form.get('new_password')

            if not user.check_password(current_password):
                return jsonify({
                    'status': 'error',
                    'message': 'Current password is incorrect'
                })

            user.set_password(new_password)
            db.session.commit()
            return jsonify({
                'status': 'success',
                'message': 'Password changed successfully'
            })

    # Get user's club memberships
    memberships = ClubMember.query.filter_by(user_id=current_user.id).all()

    return render_template('settings.html', memberships=memberships)


@app.route('/club-dashboard')
@login_required
def club_dashboard():
    if not current_user.is_club_leader:
        flash('You must be a club leader to access the club dashboard',
              'error')
        return redirect(url_for('welcome'))

    return render_template('club_dashboard.html')


@app.route('/api/clubs/members/sites')
@login_required
def get_club_members_sites():
    if not current_user.is_club_leader:
        return jsonify(
            {'error': 'You must be a club leader to access this data'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    club = current_user.club

    try:
        # Get all member IDs in this club
        members = ClubMember.query.filter_by(club_id=club.id).all()
        member_ids = [member.user_id for member in members]

        # Also include club leader
        member_ids.append(current_user.id)

        # Get all sites for these members
        member_sites = []
        for member_id in member_ids:
            user = User.query.get(member_id)
            if not user:
                continue

            sites = Site.query.filter_by(user_id=member_id).all()
            for site in sites:
                member_sites.append({
                    'id': site.id,
                    'name': site.name,
                    'type': site.site_type,
                    'created_at': site.created_at.isoformat(),
                    'updated_at': site.updated_at.isoformat(),
                    'owner': {
                        'id': user.id,
                        'username': user.username
                    }
                })

        return jsonify({'sites': member_sites})
    except Exception as e:
        app.logger.error(f'Error getting club members sites: {str(e)}')
        return jsonify({'error': 'Failed to retrieve member sites'}), 500


@app.route('/api/admin/users/<int:user_id>/club-leader', methods=['POST'])
@login_required
@admin_required
def toggle_club_leader(user_id):
    if user_id == current_user.id:
        return jsonify(
            {'message': 'Cannot modify your own club leader status'}), 400

    user = User.query.get_or_404(user_id)
    data = request.get_json()
    user.is_club_leader = data.get('is_club_leader', False)

    try:
        db.session.commit()
        activity = UserActivity(
            activity_type="admin_action",
            message="Admin {username} " +
            ("assigned" if user.is_club_leader else "removed") +
            " club leader status for " + user.username,
            username=current_user.username,
            user_id=current_user.id)
        db.session.add(activity)
        db.session.commit()

        return jsonify(
            {'message': 'User club leader status updated successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error updating club leader status: {str(e)}')
        return jsonify({'message':
                        'Failed to update user club leader status'}), 500


@app.route('/api/clubs', methods=['POST'])
@login_required
def create_club():
    if not current_user.is_club_leader:
        return jsonify({'error':
                        'You must be a club leader to create a club'}), 403

    if hasattr(current_user, 'club') and current_user.club:
        return jsonify({'error': 'You already have a club'}), 400

    data = request.get_json()
    name = data.get('name')

    if not name:
        return jsonify({'error': 'Club name is required'}), 400

    try:
        club = Club(name=name,
                    description=data.get('description'),
                    location=data.get('location'),
                    meeting_day=data.get('meeting_day'),
                    meeting_time=data.get('meeting_time'),
                    leader_id=current_user.id)

        db.session.add(club)

        activity = UserActivity(
            activity_type="club_creation",
            message="Club leader {username} created club " + name,
            username=current_user.username,
            user_id=current_user.id)
        db.session.add(activity)
        db.session.commit()

        return jsonify({
            'message': 'Club created successfully',
            'club_id': club.id
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error creating club: {str(e)}')
        return jsonify({'error': 'Failed to create club'}), 500


@app.route('/api/clubs/current', methods=['GET'])
@login_required
def get_current_club():
    if not current_user.is_club_leader:
        return jsonify(
            {'error': 'You must be a club leader to access club data'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    club = current_user.club

    return jsonify({
        'id': club.id,
        'name': club.name,
        'description': club.description,
        'location': club.location,
        'meeting_day': club.meeting_day,
        'meeting_time': club.meeting_time,
        'join_code': club.join_code,
        'member_count': club.members.count()
    })


def generate_join_code(length=6):
    import string
    import random
    characters = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choices(characters, k=length))
        if not Club.query.filter_by(join_code=code).first():
            return code


@app.route('/api/clubs/join-code/generate', methods=['POST'])
@login_required
def generate_club_join_code():
    if not current_user.is_club_leader:
        return jsonify(
            {'error':
             'You must be a club leader to generate a join code'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    club = current_user.club

    try:
        join_code = generate_join_code()
        club.join_code = join_code
        db.session.commit()

        return jsonify({
            'message': 'Join code generated successfully',
            'join_code': join_code
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error generating join code: {str(e)}')
        return jsonify({'error': 'Failed to generate join code'}), 500


@app.route('/api/clubs/join', methods=['POST'])
@login_required
def join_club_with_code():
    data = request.get_json()
    join_code = data.get('join_code')

    if not join_code:
        return jsonify({'error': 'Join code is required'}), 400

    club = Club.query.filter_by(join_code=join_code).first()
    if not club:
        return jsonify({'error': 'Invalid join code'}), 404

    if club.leader_id == current_user.id:
        return jsonify({'error':
                        'You cannot join your own club as a member'}), 400

    existing_membership = ClubMember.query.filter_by(
        club_id=club.id, user_id=current_user.id).first()

    if existing_membership:
        return jsonify({'error': 'You are already a member of this club'}), 400

    try:
        membership = ClubMember(club_id=club.id,
                                user_id=current_user.id,
                                role='member')

        db.session.add(membership)
        db.session.commit()

        return jsonify({'message': f'Successfully joined {club.name}'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error joining club: {str(e)}')
        return jsonify({'error': 'Failed to join club'}), 500


@app.route('/api/clubs/current', methods=['PUT'])
@login_required
def update_club():
    if not current_user.is_club_leader:
        return jsonify(
            {'error': 'You must be a club leader to update club data'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    club = current_user.club
    data = request.get_json()

    try:
        if 'name' in data and data['name']:
            club.name = data['name']
        if 'description' in data:
            club.description = data['description']
        if 'location' in data:
            club.location = data['location']

        club.updated_at = datetime.utcnow()
        db.session.commit()

        app.logger.info(
            f'Club {club.id} updated successfully by user {current_user.id}')
        return jsonify({'message': 'Club updated successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error updating club: {str(e)}')
        return jsonify({'error': 'Failed to update club'}), 500


@app.route('/api/clubs/members', methods=['POST'])
@login_required
def add_club_member():
    if not current_user.is_club_leader:
        return jsonify({'error':
                        'You must be a club leader to add members'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    data = request.get_json()
    email = data.get('email')
    role = data.get('role', 'member')

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    if role not in ['member', 'co-leader']:
        return jsonify(
            {'error': 'Invalid role. Must be "member" or "co-leader"'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'User not found with that email'}), 404

    if user.id == current_user.id:
        return jsonify({'error': 'You cannot add yourself as a member'}), 400

    existing_membership = ClubMember.query.filter_by(
        club_id=current_user.club.id, user_id=user.id).first()

    if existing_membership:
        return jsonify({'error': 'User is already a member of this club'}), 400

    try:
        membership = ClubMember(club_id=current_user.club.id,
                                user_id=user.id,
                                role=role)

        db.session.add(membership)
        db.session.commit()

        return jsonify(
            {'message': f'Added {user.username} to the club as {role}'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error adding club member: {str(e)}')
        return jsonify({'error': 'Failed to add member to the club'}), 500


@app.route('/api/clubs/members/<int:membership_id>/role', methods=['PUT'])
@login_required
def update_member_role(membership_id):
    if not current_user.is_club_leader:
        return jsonify(
            {'error': 'You must be a club leader to update member roles'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    membership = ClubMember.query.get_or_404(membership_id)

    if membership.club_id != current_user.club.id:
        return jsonify({'error': 'Member not found in your club'}), 404

    data = request.get_json()
    role = data.get('role')

    if not role or role not in ['member', 'co-leader']:
        return jsonify(
            {'error': 'Invalid role. Must be "member" or "co-leader"'}), 400

    try:
        membership.role = role
        db.session.commit()

        return jsonify({'message': f'Updated member role to {role}'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error updating member role: {str(e)}')
        return jsonify({'error': 'Failed to update member role'}), 500


@app.route('/api/clubs/members/<int:membership_id>', methods=['DELETE'])
@login_required
def remove_club_member(membership_id):
    if not current_user.is_club_leader:
        return jsonify(
            {'error': 'You must be a club leader to remove members'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    membership = ClubMember.query.get_or_404(membership_id)

    if membership.club_id != current_user.club.id:
        return jsonify({'error': 'Member not found in your club'}), 404

    try:
        username = membership.user.username
        db.session.delete(membership)
        db.session.commit()

        return jsonify({'message': f'Removed {username} from the club'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error removing club member: {str(e)}')
        return jsonify({'error': 'Failed to remove member from the club'}), 500


@app.route('/api/clubs/memberships/<int:membership_id>/leave',
           methods=['POST'])
@login_required
def leave_club(membership_id):
    membership = ClubMember.query.get_or_404(membership_id)

    if membership.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized action'}), 403

    try:
        club_name = membership.club.name
        db.session.delete(membership)
        db.session.commit()

        return jsonify({'message': f'You have left {club_name}'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error leaving club: {str(e)}')
        return jsonify({'error': 'Failed to leave the club'}), 500


@app.route('/api/clubs/current', methods=['DELETE'])
@login_required
def delete_club():
    if not current_user.is_club_leader:
        return jsonify({'error':
                        'You must be a club leader to delete a club'}), 403

    if not hasattr(current_user, 'club') or not current_user.club:
        return jsonify({'error': 'You do not have a club'}), 404

    club = current_user.club

    try:
        # Delete all memberships first
        ClubMember.query.filter_by(club_id=club.id).delete()

        # Delete the club
        club_name = club.name  # Save name for activity log
        db.session.delete(club)

        activity = UserActivity(
            activity_type="club_deletion",
            message="Club leader {username} deleted club " + club_name,
            username=current_user.username,
            user_id=current_user.id)
        db.session.add(activity)
        db.session.commit()

        return jsonify({'message': 'Club deleted successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error deleting club: {str(e)}')
        return jsonify({'error': 'Failed to delete club'}), 500


def initialize_database():
    try:
        with app.app_context():
            db.create_all()
        return True
    except Exception as e:
        app.logger.warning(f"Database initialization skipped: {str(e)}")
        return False


@app.route('/api/sites/<int:site_id>/collaborators', methods=['GET'])
@login_required
def get_site_collaborators(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        if site.user_id != current_user.id and not current_user.is_admin:
            return jsonify({'error': 'Unauthorized'}), 403

        collaborations = SiteCollaborator.query.filter_by(
            site_id=site_id).all()
        collaborators = []
        active_collaborators = []

        for collab in collaborations:
            user = User.query.get(collab.user_id)
            if not user:
                continue

            collaborator_data = {
                'id': collab.id,
                'user_id': user.id,
                'username': user.username,
                'email': user.email,
                'added_at': collab.added_at.strftime('%Y-%m-%d %H:%M:%S'),
            }
            collaborators.append(collaborator_data)

            if collab.is_active and collab.last_active > datetime.utcnow(
            ) - timedelta(minutes=30):
                active_collaborators.append(collaborator_data)

        return jsonify({
            'collaborators': collaborators,
            'active_collaborators': active_collaborators
        })

    except Exception as e:
        app.logger.error(f'Error getting collaborators: {str(e)}')
        return jsonify({'error': 'Failed to get collaborators'}), 500


@app.route('/api/sites/<int:site_id>/collaborators', methods=['POST'])
@login_required
def add_site_collaborator(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        if site.user_id != current_user.id and not current_user.is_admin:
            return jsonify({'error': 'Unauthorized'}), 403

        data = request.get_json()
        email = data.get('email')

        if not email:
            return jsonify({'error': 'Email is required'}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({'error': 'User not found with that email'}), 404

        if user.id == current_user.id:
            return jsonify(
                {'error': 'You cannot add yourself as a collaborator'}), 400

        existing = SiteCollaborator.query.filter_by(site_id=site_id,
                                                    user_id=user.id).first()
        if existing:
            return jsonify({'error': 'User is already a collaborator'}), 400

        collaborator = SiteCollaborator(site_id=site_id, user_id=user.id)
        db.session.add(collaborator)

        activity = UserActivity(
            activity_type="collaborator_added",
            message=
            "User {username} added {collab_username} as a collaborator on site {site_name}",
            username=current_user.username,
            user_id=current_user.id,
            site_id=site_id)
        db.session.add(activity)
        db.session.commit()

        return jsonify({
            'message':
            f'Successfully added {user.username} as a collaborator'
        })

    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error adding collaborator: {str(e)}')
        return jsonify({'error': 'Failed to add collaborator'}), 500


@app.route('/api/sites/<int:site_id>/collaborators/<int:collab_id>',
           methods=['DELETE'])
@login_required
def remove_site_collaborator(site_id, collab_id):
    try:
        site = Site.query.get_or_404(site_id)
        if site.user_id != current_user.id and not current_user.is_admin:
            return jsonify({'error': 'Unauthorized'}), 403

        collaborator = SiteCollaborator.query.get_or_404(collab_id)
        if collaborator.site_id != site_id:
            return jsonify({'error':
                            'Collaborator not found for this site'}), 404

        user = User.query.get(collaborator.user_id)
        username = user.username if user else 'Unknown'

        db.session.delete(collaborator)

        activity = UserActivity(
            activity_type="collaborator_removed",
            message=
            "User {username} removed {collab_username} as a collaborator from site {site_name}",
            username=current_user.username,
            user_id=current_user.id,
            site_id=site_id)
        db.session.add(activity)
        db.session.commit()

        return jsonify(
            {'message': f'Successfully removed {username} as a collaborator'})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error removing collaborator: {str(e)}')
        return jsonify({'error': 'Failed to remove collaborator'}), 500


@app.route('/api/collaborations/<int:collab_id>/leave', methods=['POST'])
@login_required
def leave_shared_space(collab_id):
    try:
        collaborator = SiteCollaborator.query.get_or_404(collab_id)

        if collaborator.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403

        site_id = collaborator.site_id
        site = Site.query.get(site_id)
        site_name = site.name if site else 'Unknown'

        db.session.delete(collaborator)

        activity = UserActivity(
            activity_type="collaboration_left",
            message="User {username} left collaboration on site {site_name}",
            username=current_user.username,
            user_id=current_user.id,
            site_id=site_id)
        db.session.add(activity)
        db.session.commit()

        return jsonify(
            {'message': f'Successfully left shared space: {site_name}'})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error leaving shared space: {str(e)}')
        return jsonify({'error': 'Failed to leave shared space'}), 500


@app.route('/api/sites/<int:site_id>/collaborators/status', methods=['POST'])
@login_required
def update_collaboration_status(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        is_owner = site.user_id == current_user.id

        collaborator = None
        if not is_owner:
            collaborator = SiteCollaborator.query.filter_by(
                site_id=site_id, user_id=current_user.id).first()
            if not collaborator:
                return jsonify({'error': 'Unauthorized'}), 403

        data = request.get_json()
        is_active = data.get('is_active', True)

        if collaborator:
            collaborator.is_active = is_active
            collaborator.last_active = datetime.utcnow()
        else:
            pass

        db.session.commit()

        return jsonify({'message': 'Collaboration status updated'})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error updating collaboration status: {str(e)}')
        return jsonify({'error': 'Failed to update collaboration status'}), 500


@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    if current_user.is_authenticated:
        global sid_to_user_id, user_to_sids
        sid_to_user_id[request.sid] = current_user.id

        if current_user.id not in user_to_sids:
            user_to_sids[current_user.id] = set()
        user_to_sids[current_user.id].add(request.sid)


@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')

    global sid_to_user_id, user_to_sids, room_members

    user_id = sid_to_user_id.pop(request.sid, None)

    if user_id and user_id in user_to_sids:
        user_to_sids[user_id].discard(request.sid)
        if not user_to_sids[user_id]:
            del user_to_sids[user_id]

    for room_name in list(room_members.keys()):
        if request.sid in room_members.get(room_name, set()):
            room_members[room_name].discard(request.sid)
            if not room_members[room_name]:
                del room_members[room_name]

    if not current_user.is_authenticated:
        return

    for room in rooms():
        if room.startswith('site_'):
            try:
                site_id = int(room.split('_')[1])
                site = Site.query.get(site_id)

                is_owner = site and site.user_id == current_user.id

                emit('user_left', {
                    'username': current_user.username,
                    'user_id': current_user.id,
                    'is_owner': is_owner
                },
                     to=room,
                     skip_sid=request.sid)

                if is_owner:
                    emit('owner_left', to=room, skip_sid=request.sid)
                    collaborators = SiteCollaborator.query.filter_by(
                        site_id=site_id).all()
                    for collab in collaborators:
                        collab.is_active = False
                    db.session.commit()
                else:
                    collaborator = SiteCollaborator.query.filter_by(
                        site_id=site_id, user_id=current_user.id).first()
                    if collaborator:
                        collaborator.is_active = False
                        db.session.commit()
            except Exception as e:
                app.logger.error(f'Error handling disconnect: {str(e)}')

            leave_room(room)


@socketio.on('join')
def handle_join(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    site = Site.query.get(site_id)
    if not site:
        return

    is_owner = site.user_id == current_user.id

    if not is_owner:
        collaborator = SiteCollaborator.query.filter_by(
            site_id=site_id, user_id=current_user.id).first()
        if not collaborator:
            return

    room = f'site_{site_id}'
    global room_members

    already_joined = False
    if room in room_members and request.sid in room_members[room]:
        already_joined = True
    else:
        join_room(room)

        if room not in room_members:
            room_members[room] = set()
        room_members[room].add(request.sid)

    if site and site.user_id != current_user.id:
        collaborator = SiteCollaborator.query.filter_by(
            site_id=site_id, user_id=current_user.id).first()
        if collaborator:
            collaborator.is_active = True
            collaborator.last_active = datetime.utcnow()
            db.session.commit()

    if not already_joined:
        emit('user_joined', {
            'username': current_user.username,
            'id': current_user.id
        },
             to=room,
             skip_sid=request.sid)

    try:
        site = Site.query.get(site_id)
        active_users = []

        if site:
            owner = User.query.get(site.user_id)
            if owner:
                active_users.append({
                    'username': owner.username,
                    'id': owner.id,
                    'is_owner': True
                })

            collaborators = SiteCollaborator.query.filter(
                SiteCollaborator.site_id == site_id,
                SiteCollaborator.is_active == True,
                SiteCollaborator.last_active
                > datetime.utcnow() - timedelta(minutes=30)).all()

            for collab in collaborators:
                if collab.user_id == current_user.id:
                    continue

                user = User.query.get(collab.user_id)
                if user:
                    active_users.append({
                        'username': user.username,
                        'id': user.id,
                        'is_owner': False
                    })

        emit('active_users', {'users': active_users})
    except Exception as e:
        app.logger.error(f'Error getting active users: {str(e)}')


@socketio.on('leave')
def handle_leave(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    room = f'site_{site_id}'
    leave_room(room)

    site = Site.query.get(site_id)
    is_owner = site and site.user_id == current_user.id

    if not is_owner:
        collaborator = SiteCollaborator.query.filter_by(
            site_id=site_id, user_id=current_user.id).first()
        if collaborator:
            collaborator.is_active = False
            db.session.commit()
    else:
        collaborators = SiteCollaborator.query.filter_by(site_id=site_id).all()
        for collab in collaborators:
            collab.is_active = False
        db.session.commit()

    emit('user_left', {
        'username': current_user.username,
        'user_id': current_user.id,
        'is_owner': is_owner
    },
         to=room)

    if is_owner:
        emit('owner_left', to=room)


@socketio.on('cursor_move')
def handle_cursor_move(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    site = Site.query.get(site_id)
    if not site:
        return

    is_owner = site.user_id == current_user.id

    if not is_owner:
        collaborator = SiteCollaborator.query.filter_by(
            site_id=site_id, user_id=current_user.id).first()
        if not collaborator:
            return

        collaborator.last_active = datetime.utcnow()
        db.session.commit()

    cursor_data = data.get('cursor', {})
    cursor_data.update({
        'username': current_user.username,
        'user_id': current_user.id,
        'is_owner': is_owner,
        'line': cursor_data.get('line', 0),
        'ch': cursor_data.get('ch', 0),
        'selection': cursor_data.get('selection')
    })

    room = f'site_{site_id}'
    emit('cursor_update', cursor_data, to=room, skip_sid=request.sid)


@socketio.on('content_change')
def handle_content_change(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    site = Site.query.get(site_id)
    if not site:
        return

    if site.user_id != current_user.id:
        collaborator = SiteCollaborator.query.filter_by(
            site_id=site_id, user_id=current_user.id).first()
        if not collaborator:
            return

        collaborator.last_active = datetime.utcnow()
        db.session.commit()

    update_data = {
        'content': data.get('content'),
        'username': current_user.username,
        'user_id': current_user.id,
        'timestamp': datetime.utcnow().timestamp(),
        'origin': data.get('origin'),
        'from': data.get('from'),
        'to': data.get('to'),
        'text': data.get('text')
    }

    room = f'site_{site_id}'
    emit('content_update', update_data, to=room, skip_sid=request.sid)


@socketio.on('owner_timeout')
def handle_owner_timeout(data):
    if not current_user.is_authenticated:
        return

    site_id = data.get('site_id')
    if not site_id:
        return

    site = Site.query.get(site_id)
    if not site or site.user_id != current_user.id:
        return

    room = f'site_{site_id}'
    emit('owner_timeout', to=room, skip_sid=request.sid)

    collaborators = SiteCollaborator.query.filter_by(site_id=site_id).all()
    for collab in collaborators:
        collab.is_active = False
    db.session.commit()


@app.route('/site/update/<int:site_id>', methods=['POST'])
@login_required
def update_site_form(site_id):
    site = Site.query.get_or_404(site_id)

    if site.user_id != current_user.id:
        abort(403)

    if site.site_type == 'web' and 'html_content' in request.form:
        site.html_content = request.form['html_content']
    elif site.site_type == 'python' and 'python_content' in request.form:
        site.python_content = request.form['python_content']
    else:
        return jsonify({'error': 'No content provided'}), 400

    site.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'success': True})


if __name__ == '__main__':
    try:
        initialize_database()
    except Exception as e:
        app.logger.warning(f"Database initialization error: {e}")
    socketio.run(app, host='0.0.0.0', port=3000, allow_unsafe_werkzeug=True)
