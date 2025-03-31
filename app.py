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
from models import db, User, Site, SitePage, UserActivity, Club, ClubMembership
# Custom slugify implementation to avoid unicode errors
def slugify(text):
    import re
    # Ensure text is a string
    text = str(text)
    # Convert to lowercase
    text = text.lower()
    # Remove non-word characters (alphanumerics and underscores)
    text = re.sub(r'[^\w\s-]', '', text)
    # Replace spaces with hyphens
    text = re.sub(r'\s+', '-', text)
    # Remove leading/trailing hyphens
    text = text.strip('-')
    return text
from github_routes import github_bp
from slack_routes import slack_bp
from groq import Groq

load_dotenv()


def get_database_url():
    url = os.getenv('DATABASE_URL')
    if url and url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    return url


app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev')
app.config['SQLALCHEMY_DATABASE_URI'] = get_database_url()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 20,
    'pool_recycle': 1800,  # Recycle connections every 30 minutes
    'pool_timeout': 30,    # Shorter timeout for better error handling
    'max_overflow': 10,    # Allow up to 10 additional connections when needed
    'pool_pre_ping': True  # Check if connection is still alive before using
}

app.config['PREFERRED_URL_SCHEME'] = 'https'
app.config['EXPLAIN_TEMPLATE_LOADING'] = True
app.config['TEMPLATES_AUTO_RELOAD'] = True


def get_error_context(error):
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
        context['error_type'] = 'Database Error'
        context['suggestions'].extend([
            'Verify database connection settings',
            'Check for invalid queries or constraints',
            'Ensure all required fields are provided'
        ])

    elif isinstance(error, werkzeug.exceptions.HTTPException):
        context['error_type'] = f'HTTP {error.code}'
        context['suggestions'].extend(get_http_error_suggestions(error.code))

    if hasattr(error, '__traceback__'):
        import traceback
        context['traceback'] = ''.join(traceback.format_tb(
            error.__traceback__))

    return context


def get_http_error_suggestions(code):
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
    db.session.rollback()
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


@app.errorhandler(Exception)
def handle_error(error):
    code = getattr(error, 'code', 500)
    if code == 500:
        db.session.rollback()

    context = get_error_context(error)
    app.logger.error(f'Unhandled Exception: {context}')

    return render_template('errors/generic.html', **context), code


@app.errorhandler(jinja2.TemplateError)
def template_error(error):
    context = get_error_context(error)
    app.logger.error(f'Template Error: {context}')
    return render_template('errors/500.html', **context), 500


@app.route('/api/report-error', methods=['POST'])
def report_error():
    try:
        error_data = request.get_json()

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

        app.logger.error(
            f'Client Error Report: {json.dumps(error_log, indent=2)}')

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        app.logger.error(f'Error in report_error: {str(e)}')
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.after_request
def add_security_headers(response):
    # Check if this is a preview request
    is_preview = request.args.get('preview') == 'true'
    
    # Base CSP policy
    csp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: https: http:; font-src 'self' data: https://cdnjs.cloudflare.com; connect-src 'self' wss: ws:;"
    
    # Add frame-ancestors directive
    if is_preview:
        # Allow embedding from any origin for preview requests
        csp += " frame-ancestors *;"
    else:
        # Only allow embedding from self for regular requests
        csp += " frame-ancestors 'self';"
    
    response.headers['Content-Security-Policy'] = csp
    response.headers['X-Content-Type-Options'] = 'nosniff'
    
    # Set Access-Control-Allow-Origin for preview requests
    if is_preview:
        response.headers['Access-Control-Allow-Origin'] = '*'
    
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


class RateLimiter:

    def __init__(self):
        self.requests = {}
        self.limits = {
            'default': {
                'requests': 100,
                'window': 60
            },
            'api_run': {
                'requests': 10,
                'window': 60
            },
            'login': {
                'requests': 5,
                'window': 60
            },
            'orphy': {
                'requests': 1,
                'window': 0.5
            }
        }

    def is_rate_limited(self, key, limit_type='default'):
        current_time = time.time()
        limit_config = self.limits.get(limit_type, self.limits['default'])

        if key not in self.requests:
            self.requests[key] = []

        self.requests[key] = [
            t for t in self.requests[key]
            if current_time - t < limit_config['window']
        ]

        if len(self.requests[key]) >= limit_config['requests']:
            return True

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


@app.route('/api/orphy/chat', methods=['POST'])
@rate_limit('orphy')
def orphy_chat_proxy():
    try:
        client_data = request.json

        user_message = client_data.get('message', '')
        code_content = client_data.get('code', '')
        filename = client_data.get('filename', 'untitled')

        system_prompt = "You are Orphy, a friendly and helpful AI assistant for Hack Club Spaces. Your goal is to help users with their coding projects. Keep your responses concise, and primarily give suggestions rather than directly solving everything for them. Use friendly language with some emoji but not too many. Give guidance that encourages learning."

        user_prompt = f"I'm working on a file named {filename} with the following code:\n\n{code_content}\n\nHere's my question: {user_message}"

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

            message_content = chat_completion.choices[0].message.content
            return jsonify({
                'response': message_content,
                'provider': 'groq'
            }), 200

        except Exception as groq_error:
            app.logger.warning(
                f"Groq API failed: {str(groq_error)}. Falling back to Hack Club AI."
            )

            try:
                app.logger.info("Attempting to use Hack Club AI API")

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

                response = requests.post(
                    'https://ai.hackclub.com/chat/completions',
                    json=ai_request_data,
                    headers={'Content-Type': 'application/json'},
                    timeout=15)

                if response.status_code == 200:
                    ai_response = response.json()
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


def check_access_code(f):

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_admin and not current_user.has_special_access:
            return redirect(url_for('access_code'))
        return f(*args, **kwargs)

    return decorated_function


@app.route('/welcome')
@login_required
@check_access_code
def welcome():
    sites = Site.query.filter_by(user_id=current_user.id).order_by(
        Site.updated_at.desc()).all()
    max_sites = get_max_sites_per_user()
    
    # Get shared spaces for the user
    shared_spaces = db.session.query(ClubMembership).filter_by(user_id=current_user.id).all()
    
    return render_template('welcome.html', 
                          sites=sites, 
                          max_sites=max_sites, 
                          shared_spaces=shared_spaces)


@app.route('/access-code', methods=['GET', 'POST'])
@login_required
def access_code():
    if request.method == 'POST':
        code = request.form.get('code')
        if code == 'SD2191305':
            current_user.has_special_access = True
            db.session.commit()
            flash('Special access granted!', 'success')
            return redirect(url_for('welcome'))
        flash('Invalid access code', 'error')
    return render_template('access_code.html')


@app.route('/edit/<int:site_id>')
@login_required
@check_access_code
def edit_site(site_id):
    try:
        site = Site.query.get_or_404(site_id)

        is_admin = current_user.is_admin
        is_owner = site.user_id == current_user.id

        if not is_owner and not is_admin:
            app.logger.warning(
                f'User {current_user.id} attempted to access site {site_id} owned by {site.user_id}'
            )
            abort(403)

        app.logger.info(f'User {current_user.id} editing site {site_id}')

        return render_template('editor.html', site=site)
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

        if len(code) > 10000:
            return jsonify({
                'output':
                'Error: Code exceeds maximum allowed length (10,000 characters)',
                'error': True
            }), 400

        old_stdout = sys.stdout
        redirected_output = StringIO()
        sys.stdout = redirected_output

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

            execute_with_timeout(code, restricted_globals, timeout=5)

            output = redirected_output.getvalue()

            if not output.strip():
                output = "Code executed successfully, but produced no output. Add print() statements to see results."

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


@app.route('/s/<string:slug>', defaults={'filename': None})
@app.route('/s/<string:slug>/<path:filename>')
def view_site(slug, filename):
    site = Site.query.filter_by(slug=slug).first_or_404()
    if not site.is_public and (not current_user.is_authenticated
                               or site.user_id != current_user.id):
        abort(403)

    if not filename and hasattr(
            site, 'analytics_enabled') and site.analytics_enabled:
        with db.engine.connect() as connection:
            connection.execute(
                db.text(
                    f"UPDATE site SET view_count = view_count + 1 WHERE id = {site.id}"
                ))
            connection.commit()

    if not filename:
        return site.html_content

    try:
        page = SitePage.query.filter_by(site_id=site.id,
                                        filename=filename).first()

        if not page:
            app.logger.warning(
                f"Page not found: {filename} for site {site.id}")
            abort(404)

        mime_types = {
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript'
        }

        content_type = mime_types.get(page.file_type, 'text/plain')
        app.logger.info(f"Serving {filename} with MIME type: {content_type}")

        return Response(page.content, mimetype=content_type)
    except Exception as e:
        app.logger.error(
            f"Error serving file {filename} for site {site.id}: {str(e)}")
        abort(500)


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

        # Ensure name is a string
        name = str(name)
        
        try:
            slug = slugify(name)
        except Exception as e:
            app.logger.error(f'Error slugifying name: {str(e)}')
            return jsonify({'message': 'Invalid site name provided'}), 400
        existing_site = Site.query.filter_by(slug=slug).first()
        if existing_site:
            app.logger.warning(f'Site with slug {slug} already exists')
            return jsonify(
                {'message': 'A space with this name already exists'}), 400

        app.logger.info(
            f'Creating new site "{name}" for user {current_user.id}')

        default_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Website</title>
    <link rel="stylesheet" href="/s/{slug}/styles.css">
    <script src="/s/{slug}/script.js" defer></script>
</head>
<body>
    <h1>Welcome to my website!</h1>
    <p>This is a paragraph on my new site.</p>
</body>
</html>'''

        site = Site(name=name,
                    user_id=current_user.id,
                    html_content=default_html)
        db.session.add(site)
        db.session.commit()

        default_css = '''body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    margin: 0;
    padding: 20px;
    color: #333;
    max-width: 800px;
    margin: 0 auto;
}

h1 {
    color: #2c3e50;
    border-bottom: 2px solid #eee;
    padding-bottom: 10px;
}'''

        default_js = '''document.addEventListener('DOMContentLoaded', function() {
    console.log('Website loaded successfully!');
});'''

        try:
            css_page = SitePage(site_id=site.id,
                                filename="styles.css",
                                content=default_css,
                                file_type="css")

            js_page = SitePage(site_id=site.id,
                               filename="script.js",
                               content=default_js,
                               file_type="js")

            html_page = SitePage(site_id=site.id,
                                 filename="index.html",
                                 content=default_html,
                                 file_type="html")

            db.session.add_all([css_page, js_page, html_page])
            db.session.commit()

            app.logger.info(
                f"Successfully created site pages for site {site.id}")
        except Exception as e:
            app.logger.error(f"Error creating site pages: {str(e)}")
            db.session.rollback()

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
        return jsonify({'message': 'Failed to createsite'}), 500


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
        
        # Log activity
        activity_message = f'Updated {"Python" if python_content else "Web"} site "{site.name}"'
        activity = UserActivity(activity_type='site_update',
                                message=activity_message,
                                username=current_user.username,
                                user_id=current_user.id,
                                site_id=site.id)
        db.session.add(activity)
        db.session.commit()
        
        return jsonify({'message': 'Site updated successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error updating site: {str(e)}')
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

        # Default Python hello world script with some helpful comments
        default_python_content = '''# Welcome to your Python space!
# This is where you can write and run Python code.

def main():
    """Main function that runs when this script is executed."""
    print("Hello, World!")
    
    # Try adding your own code below:
    name = "Python Coder"
    print(f"Welcome, {name}!")
    
    # You can use loops:
    for i in range(3):
        print(f"Count: {i}")
    
    # And conditions:
    if name == "Python Coder":
        print("You're a Python coder!")
    else:
        print("You can become a Python coder!")

# Standard Python idiom to call the main function
if __name__ == "__main__":
    main()
'''

        site = Site(name=name,
                    user_id=current_user.id,
                    python_content=default_python_content,
                    site_type='python')
        db.session.add(site)
        db.session.commit()

        activity = UserActivity(activity_type="site_creation",
                            message='New Python space "{}" created by {}'.format(
                                name, current_user.username),
                            username=current_user.username,
                            user_id=current_user.id,
                            site_id=site.id)
        db.session.add(activity)
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

        if not is_owner and not is_admin:
            app.logger.warning(
                f'User {current_user.id} attempted to access Python site {site_id} owned by {site.user_id}'
            )
            abort(403)

        app.logger.info(
            f'User {current_user.id} editing Python site {site_id}')

        socket_join_script = f'''
        <script>
            document.addEventListener('DOMContentLoaded', function() {{
                if (typeof socket !== 'undefined') {{
                    console.log('Auto-joining socket room: site_{site_id}');
                    socket.emit('join', {{ site_id: {site_id} }});
                }} else {{
                    console.error('Socket not initialized');
                }}
            }});
        </script>
        '''

        return render_template('pythoneditor.html',
                               site=site,
                               additional_scripts=socket_join_script)
    except Exception as e:
        app.logger.error(f'Error in python_editor: {str(e)}')
        abort(500)


@app.route('/api/sites/<int:site_id>', methods=['DELETE'])
@login_required
def delete_site(site_id):
    site = Site.query.get_or_404(site_id)
    if site.user_id != current_user.id:
        abort(403)

    try:
        with db.engine.connect() as conn:
            conn.execute(
                db.text("DELETE FROM site_page WHERE site_id = :site_id"),
                {"site_id": site_id})
            conn.commit()

        db.session.delete(site)
        db.session.commit()

        activity = UserActivity(
            activity_type="site_deletion",
            message=f'Site "{site.name}" deleted by {{username}}',
            username=current_user.username,
            user_id=current_user.id)
        db.session.add(activity)
        db.session.commit()

        return jsonify({'message': 'Site deleted successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error deleting site {site_id}: {str(e)}')
        return jsonify({'message': f'Failed to delete site: {str(e)}'}), 500


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


@app.route('/special-access', methods=['POST'])
@login_required
def special_access():
    code = request.form.get('code')
    if code == 'SD2191305':
        current_user.has_special_access = True
        db.session.commit()
        flash('Special access granted!', 'success')
        return redirect(url_for('welcome'))
    flash('Invalid access code', 'error')
    return redirect(url_for('welcome'))


@app.route('/admin')
@login_required
def admin_panel():
    if not current_user.is_admin and not current_user.has_special_access:
        abort(403)
    try:
        # Load only 50 users and sites initially for better performance
        users = User.query.with_entities(
            User.id, User.username, User.email, User.created_at, 
            User.is_suspended, User.is_admin
        ).limit(50).all()

        sites = db.session.query(
            Site.id, Site.name, Site.slug, Site.site_type, 
            Site.created_at, Site.updated_at, Site.user_id,
            User.username
        ).join(User).limit(50).all()
        
        # Get version from changelog
        version = '1.7.7'
        try:
            with open('changelog.md', 'r') as f:
                for line in f:
                    if line.startswith('## Version'):
                        version = line.split(' ')[2].strip('() ✨')
                        break
        except Exception as e:
            app.logger.error(f'Error reading version from changelog: {str(e)}')

        return render_template('admin_panel.html', users=users, sites=sites, version=version)
    except Exception as e:
        app.logger.error(f'Error loading admin panel: {str(e)}')
        flash('Error loading admin panel: ' + str(e), 'error')
        return redirect(url_for('welcome'))


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
        with db.engine.connect() as conn:
            conn.execute(
                db.text("DELETE FROM site_page WHERE site_id = :site_id"),
                {"site_id": site_id})
            conn.commit()

        db.session.delete(site)
        db.session.commit()

        activity = UserActivity(
            activity_type="admin_action",
            message=f'Admin {{username}} deleted site "{site.name}"',
            username=current_user.username,
            user_id=current_user.id)
        db.session.add(activity)
        db.session.commit()

        return jsonify({'message': 'Site deleted successfully'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error deleting site {site_id} by admin: {str(e)}')
        return jsonify({'message': f'Failed to delete site: {str(e)}'}), 500


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
        
@app.route('/api/admin/users/<int:user_id>/club-leader', methods=['POST'])
@login_required
@admin_required
def toggle_club_leader(user_id):
    """Toggle a user's club leader status."""
    if user_id == current_user.id:
        return jsonify({'message': 'Cannot change your own club leader status'}), 400
        
    user = User.query.get_or_404(user_id)
    data = request.get_json()
    make_leader = data.get('is_club_leader', False)
    
    try:
        # Check if user already has a club
        existing_club = Club.query.filter_by(leader_id=user.id).first()
        
        if make_leader and not existing_club:
            # Always set admin status for club leaders
            user.is_admin = True
            db.session.commit()  # Commit the admin status change first
            
            # Create a default club for the user
            club = Club(
                name=f"{user.username}'s Club",
                leader_id=user.id
            )
            club.generate_join_code()
            db.session.add(club)
            db.session.commit()  # Commit to get the club ID
            
            # Now create membership with valid club_id
            membership = ClubMembership(
                user_id=user.id,
                club_id=club.id,
                role='co-leader'
            )
            db.session.add(membership)
            
            # Record activity
            activity = UserActivity(
                activity_type="admin_action",
                message=f"Admin {{username}} made {user.username} a club leader",
                username=current_user.username,
                user_id=current_user.id
            )
            db.session.add(activity)
            
            db.session.commit()
            app.logger.info(f"Successfully made {user.username} a club leader")
            return jsonify({'message': f"Made {user.username} a club leader", 'status': 'success'})
            
        elif not make_leader and existing_club:
            # Remove all club memberships
            ClubMembership.query.filter_by(club_id=existing_club.id).delete()
            
            # Delete the club
            db.session.delete(existing_club)
            
            # Remove admin status if it was only for club leader
            user.is_admin = False
            
            # Record activity
            activity = UserActivity(
                activity_type="admin_action",
                message=f"Admin {{username}} removed {user.username} as a club leader",
                username=current_user.username,
                user_id=current_user.id
            )
            db.session.add(activity)
            
            db.session.commit()
            return jsonify({'message': f"Removed {user.username} as a club leader", 'status': 'success'})
            
        return jsonify({'message': 'No changes made', 'status': 'success'})
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error toggling club leader status: {str(e)}')
        return jsonify({'message': 'Failed to update club leader status', 'error': str(e)}), 500


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


@app.route('/api/admin/search/users')
@login_required
@admin_required
def search_users():
    try:
        search_term = request.args.get('term', '')
        if not search_term or len(search_term) < 2:
            return jsonify({'error': 'Search term must be at least 2 characters'}), 400
            
        users = User.query.with_entities(
            User.id, User.username, User.email, User.created_at, 
            User.is_suspended, User.is_admin
        ).filter(
            db.or_(
                User.username.ilike(f'%{search_term}%'),
                User.email.ilike(f'%{search_term}%')
            )
        ).limit(50).all()
        
        result = []
        for user in users:
            # Check explicitly if the user is a club leader
            is_club_leader = Club.query.filter_by(leader_id=user.id).first() is not None
            
            result.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'is_suspended': user.is_suspended,
                'is_admin': user.is_admin,
                'is_club_leader': is_club_leader
            })
            
        return jsonify({'users': result})
    except Exception as e:
        app.logger.error(f'Error searching users: {str(e)}')
        return jsonify({'error': 'Failed to search users'}), 500

@app.route('/api/admin/search/sites')
@login_required
@admin_required
def search_sites():
    try:
        search_term = request.args.get('term', '')
        if not search_term or len(search_term) < 2:
            return jsonify({'error': 'Search term must be at least 2 characters'}), 400
            
        sites = db.session.query(
            Site.id, Site.name, Site.slug, Site.site_type, 
            Site.created_at, Site.updated_at, Site.user_id,
            User.username
        ).join(User).filter(
            db.or_(
                Site.name.ilike(f'%{search_term}%'),
                Site.slug.ilike(f'%{search_term}%'),
                User.username.ilike(f'%{search_term}%')
            )
        ).limit(50).all()
        
        result = []
        for site in sites:
            result.append({
                'id': site.id,
                'name': site.name,
                'slug': site.slug,
                'site_type': site.site_type,
                'created_at': site.created_at.strftime('%Y-%m-%d'),
                'updated_at': site.updated_at.strftime('%Y-%m-%d %H:%M'),
                'user_id': site.user_id,
                'username': site.username
            })
            
        return jsonify({'sites': result})
    except Exception as e:
        app.logger.error(f'Error searching sites: {str(e)}')
        return jsonify({'error': 'Failed to search sites'}), 500
        
@app.route('/api/admin/stats/counts')
@login_required
@admin_required
def get_total_counts():
    """Get total counts of users and sites for admin dashboard."""
    try:
        total_users = User.query.count()
        total_sites = Site.query.count()
        
        return jsonify({
            'totalUsers': total_users,
            'totalSites': total_sites
        })
    except Exception as e:
        app.logger.error(f'Error getting total counts: {str(e)}')
        return jsonify({'error': 'Failed to get total counts'}), 500

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


@app.route('/api/sites/<int:site_id>/files', methods=['GET', 'POST'])
@login_required
def site_files(site_id):
    try:
        site = Site.query.get_or_404(site_id)

        if site.user_id != current_user.id and not current_user.is_admin:
            return jsonify({'error': 'Unauthorized'}), 403

        if request.method == 'GET':
            pages = SitePage.query.filter_by(site_id=site_id).all()
            files = [{
                'filename': page.filename,
                'file_type': page.file_type
            } for page in pages]

            return jsonify({'success': True, 'files': files})

        elif request.method == 'POST':
            data = request.get_json()
            filename = data.get('filename')
            content = data.get('content', '')
            file_type = data.get('file_type')

            if not filename:
                return jsonify({'error': 'Filename is required'}), 400

            existing = SitePage.query.filter_by(site_id=site_id,
                                                filename=filename).first()
            if existing:
                return jsonify({'error': 'File already exists'}), 400

            new_page = SitePage(site_id=site_id,
                                filename=filename,
                                content=content,
                                file_type=file_type)
            db.session.add(new_page)
            db.session.commit()

            activity = UserActivity(
                activity_type='file_creation',
                message=f'Created new file "{filename}" for site "{site.name}"',
                username=current_user.username,
                user_id=current_user.id,
                site_id=site.id)
            db.session.add(activity)
            db.session.commit()

            return jsonify({
                'success': True,
                'message': f'File {filename} created successfully'
            })

        return jsonify({'error': 'Invalid request method'}), 405

    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error in site_files: {str(e)}')
        return jsonify({'error': f'Server error: {str(e)}'}), 500


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


@app.route('/api/site/<int:site_id>/save', methods=['POST'])
@login_required
def save_site_content(site_id):
    site = Site.query.get_or_404(site_id)

    if site.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()

    if site.site_type == 'web':
        site.html_content = data.get('content')
    else:
        site.python_content = data.get('content')

    db.session.commit()

    activity = UserActivity(activity_type='site_update',
                            message=f'Updated site "{site.name}"',
                            username=current_user.username,
                            user_id=current_user.id,
                            site_id=site.id)
    db.session.add(activity)
    db.session.commit()

    return jsonify({'success': True, 'message': 'Content saved successfully'})


@app.route('/api/admin/users-list')
@login_required
@admin_required
def get_admin_users_list():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '')
        
        query = User.query
        
        if search:
            query = query.filter(
                db.or_(
                    User.username.ilike(f'%{search}%'),
                    User.email.ilike(f'%{search}%')
                )
            )
            
        total = query.count()
        users = query.order_by(User.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
        
        users_list = []
        for user in users.items:
            # Check explicitly if the user is a club leader
            is_club_leader = Club.query.filter_by(leader_id=user.id).first() is not None
            
            users_list.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'created_at': user.created_at.isoformat(),
                'is_admin': user.is_admin,
                'is_suspended': user.is_suspended,
                'is_club_leader': is_club_leader,
                'sites_count': Site.query.filter_by(user_id=user.id).count()
            })
            
        return jsonify({
            'users': users_list,
            'total': total,
            'pages': users.pages,
            'current_page': users.page
        })
    except Exception as e:
        app.logger.error(f'Error getting admin users list: {str(e)}')
        return jsonify({'error': 'Failed to retrieve users'}), 500

@app.route('/api/admin/sites-list')
@login_required
@admin_required
def get_admin_sites_list():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '')
        
        query = Site.query
        
        if search:
            query = query.filter(Site.name.ilike(f'%{search}%'))
            
        total = query.count()
        sites = query.order_by(Site.updated_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
        
        sites_list = []
        for site in sites.items:
            user = User.query.get(site.user_id)
            sites_list.append({
                'id': site.id,
                'name': site.name,
                'slug': site.slug,
                'type': site.site_type,
                'created_at': site.created_at.isoformat(),
                'updated_at': site.updated_at.isoformat(),
                'owner': {
                    'id': user.id if user else None,
                    'username': user.username if user else 'Unknown'
                }
            })
            
        return jsonify({
            'sites': sites_list,
            'total': total,
            'pages': sites.pages,
            'current_page': sites.page
        })
    except Exception as e:
        app.logger.error(f'Error getting admin sites list: {str(e)}')
        return jsonify({'error': 'Failed to retrieve sites'}), 500

    if site.site_type == 'web':
        site.html_content = data.get('content')
    else:
        site.python_content = data.get('content')

    db.session.commit()

    activity = UserActivity(activity_type='site_update',
                            message=f'Updated site "{site.name}"',
                            username=current_user.username,
                            user_id=current_user.id,
                            site_id=site.id)
    db.session.add(activity)
    db.session.commit()

    return jsonify({'success': True, 'message': 'Content saved successfully'})


@app.route('/api/site/<int:site_id>/pages', methods=['GET'])
@login_required
def get_site_pages(site_id):
    site = Site.query.get_or_404(site_id)

    if site.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403

    with db.engine.connect() as conn:
        result = conn.execute(
            db.text("SELECT * FROM site_page WHERE site_id = :site_id"),
            {"site_id": site_id})
        pages = [{
            "filename": row[2],
            "content": row[3],
            "file_type": row[4]
        } for row in result]

    if not pages and site.site_type == 'web':
        default_html = site.html_content or '<h1>Welcome to my site!</h1>'
        default_css = 'body { font-family: Arial, sans-serif; }'
        default_js = 'console.log("Hello from JavaScript!");'

        pages = [{
            "filename": "index.html",
            "content": default_html,
            "file_type": "html"
        }, {
            "filename": "styles.css",
            "content": default_css,
            "file_type": "css"
        }, {
            "filename": "script.js",
            "content": default_js,
            "file_type": "js"
        }]

        for page in pages:
            with db.engine.connect() as conn:
                conn.execute(
                    db.text("""
                        INSERT INTO site_page (site_id, filename, content, file_type)
                        VALUES (:site_id, :filename, :content, :file_type)
                        ON CONFLICT (site_id, filename) DO UPDATE
                        SET content = :content, file_type = :file_type
                    """), {
                        "site_id": site_id,
                        "filename": page["filename"],
                        "content": page["content"],
                        "file_type": page["file_type"]
                    })
                conn.commit()

    return jsonify({'success': True, 'pages': pages})

@app.route('/api/sites/<int:site_id>/files', methods=['GET'])
@login_required
def get_site_files(site_id):
    try:
        site = Site.query.get_or_404(site_id)
        
        if site.user_id != current_user.id and not current_user.is_admin:
            return jsonify({'error': 'Unauthorized'}), 403
            
        files = []
        
        if site.site_type == 'python':
            files.append({
                'filename': 'main.py',
                'file_type': 'python'
            })
        else:
            with db.engine.connect() as conn:
                result = conn.execute(
                    db.text("SELECT filename, file_type FROM site_page WHERE site_id = :site_id"),
                    {"site_id": site_id})
                
                for row in result:
                    files.append({
                        'filename': row[0],
                        'file_type': row[1]
                    })
                    
            # Check if we have index.html
            if not any(f['filename'] == 'index.html' for f in files):
                files.append({
                    'filename': 'index.html',
                    'file_type': 'html'
                })
                
            # Check if we have styles.css
            if not any(f['filename'] == 'styles.css' for f in files):
                files.append({
                    'filename': 'styles.css',
                    'file_type': 'css'
                })
                
            # Check if we have script.js
            if not any(f['filename'] == 'script.js' for f in files):
                files.append({
                    'filename': 'script.js',
                    'file_type': 'js'
                })
        
        return jsonify({'success': True, 'files': files})
    except Exception as e:
        print(f'Error getting site files: {str(e)}')
        return jsonify({'error': 'Failed to get site files'}), 500


@app.route('/api/site/<int:site_id>/save_pages', methods=['POST'])
@login_required
def save_site_pages(site_id):
    site = Site.query.get_or_404(site_id)

    if site.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    pages = data.get('pages', [])

    if not pages:
        return jsonify({'error': 'No pages provided'}), 400

    index_html = next((page['content']
                       for page in pages if page['filename'] == 'index.html'),
                      None)

    if not index_html:
        return jsonify({'error': 'index.html is required'}), 400

    site.html_content = index_html
    db.session.commit()

    for page in pages:
        with db.engine.connect() as conn:
            conn.execute(
                db.text("""
                    INSERT INTO site_page (site_id, filename, content, file_type)
                    VALUES (:site_id, :filename, :content, :file_type)
                    ON CONFLICT (site_id, filename) DO UPDATE
                    SET content = :content, file_type = :file_type
                """), {
                    "site_id": site_id,
                    "filename": page["filename"],
                    "content": page["content"],
                    "file_type": page["file_type"]
                })
            conn.commit()

    activity = UserActivity(
        activity_type='site_update',
        message=f'Updated {len(pages)} pages for site "{site.name}"',
        username=current_user.username,
        user_id=current_user.id,
        site_id=site.id)
    db.session.add(activity)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'All pages saved successfully'
    })


@app.route('/api/site/<int:site_id>/page/<path:filename>', methods=['DELETE'])
@login_required
def delete_site_page(site_id, filename):
    site = Site.query.get_or_404(site_id)

    if site.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403

    if filename in ['index.html', 'styles.css', 'script.js']:
        return jsonify({'error': 'Cannot delete default files'}), 400

    with db.engine.connect() as conn:
        conn.execute(
            db.text(
                "DELETE FROM site_page WHERE site_id = :site_id AND filename = :filename"
            ), {
                "site_id": site_id,
                "filename": filename
            })
        conn.commit()

    activity = UserActivity(
        activity_type='site_update',
        message=f'Deleted page "{filename}" from site "{site.name}"',
        username=current_user.username,
        user_id=current_user.id,
        site_id=site.id)
    db.session.add(activity)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Page {filename} deleted successfully'
    })


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


@app.route('/up')
def health_check():
    return '', 200


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

    return render_template('settings.html')


@app.route('/club-dashboard')
@login_required
def club_dashboard():
    """Club dashboard for club leaders to manage their clubs."""
    # Check if user is a club leader
    club = Club.query.filter_by(leader_id=current_user.id).first()
    if not club:
        flash('You do not have permission to access the club dashboard.', 'error')
        return redirect(url_for('welcome'))
        
    # Get the user's club
    from models import Club, ClubMembership
    
    club = Club.query.filter_by(leader_id=current_user.id).first()
    
    if not club:
        flash('You do not have a club. Create one below.', 'info')
        
    # Get all memberships for the club if it exists
    memberships = []
    if club:
        memberships = ClubMembership.query.filter_by(club_id=club.id).all()
        
    return render_template('club_dashboard.html', club=club, memberships=memberships)

# Club API routes
@app.route('/api/clubs', methods=['POST'])
@login_required
def create_club():
    """Create a new club with the current user as leader."""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Club name is required'}), 400
            
        # Check if user already has a club
        if Club.query.filter_by(leader_id=current_user.id).first():
            return jsonify({'error': 'You already have a club'}), 400
            
        # Create new club
        club = Club(
            name=data.get('name'),
            description=data.get('description', ''),
            location=data.get('location', ''),
            leader_id=current_user.id
        )
        
        # Generate a join code for the club
        club.generate_join_code()
        db.session.add(club)
        db.session.commit()  # Commit to ensure the club has an ID
        
        # Add the leader as a member with 'co-leader' role
        membership = ClubMembership(
            user_id=current_user.id,
            club_id=club.id,
            role='co-leader'
        )
        db.session.add(membership)
        db.session.commit()
        
        # Record activity
        activity = UserActivity(
            activity_type="club_creation",
            message=f'Club "{club.name}" created by {{username}}',
            username=current_user.username,
            user_id=current_user.id
        )
        db.session.add(activity)
        db.session.commit()
        
        return jsonify({'message': 'Club created successfully'}), 201
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error creating club: {str(e)}')
        return jsonify({'error': 'Failed to create club'}), 500

@app.route('/api/clubs/current', methods=['GET', 'PUT', 'DELETE'])
@login_required
def manage_current_club():
    """Get, update, or delete the current user's club."""
    # Get the user's club (if they're a leader)
    club = Club.query.filter_by(leader_id=current_user.id).first()
    
    if not club:
        return jsonify({'error': 'You do not have a club'}), 404
        
    if request.method == 'GET':
        return jsonify({
            'id': club.id,
            'name': club.name,
            'description': club.description,
            'location': club.location,
            'join_code': club.join_code,
            'created_at': club.created_at.isoformat(),
            'members_count': ClubMembership.query.filter_by(club_id=club.id).count()
        })
        
    elif request.method == 'PUT':
        try:
            data = request.get_json()
            
            if data.get('name'):
                club.name = data.get('name')
            if 'description' in data:
                club.description = data.get('description')
            if 'location' in data:
                club.location = data.get('location')
                
            db.session.commit()
            
            return jsonify({'message': 'Club updated successfully'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f'Error updating club: {str(e)}')
            return jsonify({'error': 'Failed to update club'}), 500
            
    elif request.method == 'DELETE':
        try:
            # Delete all memberships first
            ClubMembership.query.filter_by(club_id=club.id).delete()
            
            # Delete the club
            db.session.delete(club)
            db.session.commit()
            
            # Record activity
            activity = UserActivity(
                activity_type="club_deletion",
                message=f'Club "{club.name}" deleted by {{username}}',
                username=current_user.username,
                user_id=current_user.id
            )
            db.session.add(activity)
            db.session.commit()
            
            return jsonify({'message': 'Club deleted successfully'})
        except Exception as e:
            db.session.rollback()
            app.logger.error(f'Error deleting club: {str(e)}')
            return jsonify({'error': 'Failed to delete club'}), 500

@app.route('/api/clubs/join-code/generate', methods=['POST'])
@login_required
def generate_join_code():
    """Generate a new join code for the current user's club."""
    # Get the user's club (if they're a leader)
    club = Club.query.filter_by(leader_id=current_user.id).first()
    
    if not club:
        return jsonify({'error': 'You do not have a club'}), 404
        
    try:
        # Generate a new join code
        club.generate_join_code()
        db.session.commit()
        
        return jsonify({'message': 'Join code generated successfully', 'join_code': club.join_code})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error generating join code: {str(e)}')
        return jsonify({'error': 'Failed to generate join code'}), 500

@app.route('/api/clubs/join', methods=['POST'])
@login_required
def join_club():
    """Join a club using a join code."""
    try:
        data = request.get_json()
        join_code = data.get('join_code')
        
        if not join_code:
            return jsonify({'error': 'Join code is required'}), 400
            
        # Find the club with this join code
        club = Club.query.filter_by(join_code=join_code).first()
        
        if not club:
            return jsonify({'error': 'Invalid join code'}), 404
            
        # Check if user is already a member
        existing_membership = ClubMembership.query.filter_by(
            user_id=current_user.id, club_id=club.id).first()
            
        if existing_membership:
            return jsonify({'error': 'You are already a member of this club'}), 400
            
        # Add user as a member
        membership = ClubMembership(
            user_id=current_user.id,
            club_id=club.id,
            role='member'
        )
        db.session.add(membership)
        
        # Record activity
        activity = UserActivity(
            activity_type="club_join",
            message=f'{{username}} joined club "{club.name}"',
            username=current_user.username,
            user_id=current_user.id
        )
        db.session.add(activity)
        db.session.commit()
        
        return jsonify({'message': f'Successfully joined {club.name}'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error joining club: {str(e)}')
        return jsonify({'error': 'Failed to join club'}), 500

@app.route('/api/clubs/memberships/<int:membership_id>/leave', methods=['POST'])
@login_required
def leave_club(membership_id):
    """Leave a club."""
    try:
        # Find the membership
        membership = ClubMembership.query.get_or_404(membership_id)
        
        # Verify it belongs to the current user
        if membership.user_id != current_user.id:
            return jsonify({'error': 'Unauthorized'}), 403
            
        # Prevent club leaders from leaving their own club
        if membership.club.leader_id == current_user.id:
            return jsonify({'error': 'Club leaders cannot leave. Delete the club instead.'}), 400
            
        club_name = membership.club.name
        
        # Delete the membership
        db.session.delete(membership)
        
        # Record activity
        activity = UserActivity(
            activity_type="club_leave",
            message=f'{{username}} left club "{club_name}"',
            username=current_user.username,
            user_id=current_user.id
        )
        db.session.add(activity)
        db.session.commit()
        
        return jsonify({'message': f'Successfully left {club_name}'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error leaving club: {str(e)}')
        return jsonify({'error': 'Failed to leave club'}), 500

@app.route('/api/clubs/members/<int:membership_id>/role', methods=['PUT'])
@login_required
def change_member_role(membership_id):
    """Change a member's role in a club."""
    try:
        membership = ClubMembership.query.get_or_404(membership_id)
        
        # Check if the current user is the club leader
        club = membership.club
        if club.leader_id != current_user.id:
            return jsonify({'error': 'Only club leaders can change member roles'}), 403
            
        # Prevent changing own role
        if membership.user_id == current_user.id:
            return jsonify({'error': 'You cannot change your own role'}), 400
            
        data = request.get_json()
        new_role = data.get('role')
        
        if new_role not in ['member', 'co-leader']:
            return jsonify({'error': 'Invalid role'}), 400
            
        membership.role = new_role
        db.session.commit()
        
        return jsonify({'message': f'Role updated to {new_role}'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error changing member role: {str(e)}')
        return jsonify({'error': 'Failed to change member role'}), 500

@app.route('/api/clubs/members/<int:membership_id>', methods=['DELETE'])
@login_required
def remove_member(membership_id):
    """Remove a member from a club."""
    try:
        membership = ClubMembership.query.get_or_404(membership_id)
        
        # Check if the current user is the club leader
        club = membership.club
        if club.leader_id != current_user.id:
            return jsonify({'error': 'Only club leaders can remove members'}), 403
            
        # Prevent removing self
        if membership.user_id == current_user.id:
            return jsonify({'error': 'You cannot remove yourself from the club'}), 400
            
        member_name = membership.user.username
        
        # Delete the membership
        db.session.delete(membership)
        
        # Record activity
        activity = UserActivity(
            activity_type="club_member_removal",
            message=f'{{username}} removed {member_name} from club "{club.name}"',
            username=current_user.username,
            user_id=current_user.id
        )
        db.session.add(activity)
        db.session.commit()
        
        return jsonify({'message': f'Successfully removed {member_name} from the club'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error removing member: {str(e)}')
        return jsonify({'error': 'Failed to remove member'}), 500

@app.route('/api/clubs/members/sites', methods=['GET'])
@login_required
def get_member_sites():
    """Get all sites from members of the current user's club."""
    try:
        # Check if the user is a club leader or co-leader
        club = Club.query.filter_by(leader_id=current_user.id).first()
        if not club:
            # Check if they are a co-leader
            membership = ClubMembership.query.filter_by(user_id=current_user.id, role='co-leader').first()
            if not membership:
                return jsonify({'error': 'Only club leaders can access member sites'}), 403
            club = membership.club
            
        # Get all members of the club
        memberships = ClubMembership.query.filter_by(club_id=club.id).all()
        member_ids = [m.user_id for m in memberships]
        
        # Get all sites from these members
        sites = Site.query.filter(Site.user_id.in_(member_ids)).all()
        
        # Format the result
        result = []
        for site in sites:
            result.append({
                'id': site.id,
                'name': site.name,
                'type': site.site_type,
                'updated_at': site.updated_at.isoformat(),
                'owner': {
                    'id': site.user.id,
                    'username': site.user.username
                }
            })
            
        return jsonify({'sites': result})
    except Exception as e:
        app.logger.error(f'Error getting member sites: {str(e)}')
        return jsonify({'error': 'Failed to get member sites'}), 500

def initialize_database():
    try:
        with app.app_context():
            db.create_all()
        return True
    except Exception as e:
        app.logger.warning(f"Database initialization skipped: {str(e)}")
        return False


if __name__ == '__main__':
    try:
        initialize_database()
    except Exception as e:
        app.logger.warning(f"Database initialization error: {e}")
    app.run(host='0.0.0.0', port=3000, debug=True)
