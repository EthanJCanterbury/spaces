from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from slugify import slugify
import secrets
import string

db = SQLAlchemy()


class UserActivity(db.Model):
    __tablename__ = 'user_activity'
    id = db.Column(db.Integer, primary_key=True)
    activity_type = db.Column(db.String(50), nullable=False)
    message = db.Column(db.Text, nullable=False)
    username = db.Column(db.String(80), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    site_id = db.Column(db.Integer, db.ForeignKey('site.id'), nullable=True)

    user = db.relationship('User', backref=db.backref('activities', lazy=True))
    site = db.relationship('Site', backref=db.backref('activities', lazy=True))

    def __repr__(self):
        return f'<UserActivity {self.activity_type} by {self.username}>'


class Club(db.Model):
    __tablename__ = 'club'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    location = db.Column(db.String(200), nullable=True)
    join_code = db.Column(db.String(16), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # The club leader (owner) is the user who created the club
    leader_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    leader = db.relationship('User', backref=db.backref('club', uselist=False), foreign_keys=[leader_id])

    def generate_join_code(self):
        alphabet = string.ascii_letters + string.digits
        while True:
            code = ''.join(secrets.choice(alphabet) for _ in range(8))
            # Make sure code is unique
            if not Club.query.filter_by(join_code=code).first():
                self.join_code = code
                return code

    def __repr__(self):
        return f'<Club {self.name}>'


class ClubMembership(db.Model):
    __tablename__ = 'club_membership'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    club_id = db.Column(db.Integer, db.ForeignKey('club.id'), nullable=False)
    role = db.Column(db.String(50), default='member', nullable=False)  # member, co-leader
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('club_memberships', lazy=True))
    club = db.relationship('Club', backref=db.backref('members', lazy=True))

    __table_args__ = (db.UniqueConstraint('user_id', 'club_id', name='uix_user_club'),)

    def __repr__(self):
        return f'<ClubMembership {self.user.username} in {self.club.name} as {self.role}>'


class User(UserMixin, db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    preview_code_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, default=datetime.utcnow)
    github_token = db.Column(db.Text, nullable=True)
    github_username = db.Column(db.String(100), nullable=True)
    slack_id = db.Column(db.String(50), nullable=True)
    wakatime_api_key = db.Column(db.String(100), nullable=True)
    groq_api_key = db.Column(db.String(100), nullable=True)
    is_suspended = db.Column(db.Boolean, default=False)
    is_admin = db.Column(db.Boolean, default=False)

    @property
    def is_club_leader(self):
        """Return True if the user is a club leader or co-leader."""
        return Club.query.filter_by(leader_id=self.id).first() is not None or \
               ClubMembership.query.filter_by(user_id=self.id, role='co-leader').first() is not None

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'


class GitHubRepo(db.Model):
    __tablename__ = 'github_repo'

    id = db.Column(db.Integer, primary_key=True)
    repo_name = db.Column(db.String(100), nullable=False)
    repo_url = db.Column(db.String(200), nullable=False)
    is_private = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime,
                           default=datetime.utcnow,
                           onupdate=datetime.utcnow)
    site_id = db.Column(db.Integer, db.ForeignKey('site.id'), nullable=False)
    site = db.relationship('Site',
                           backref=db.backref('github_repo', uselist=False))

    def __repr__(self):
        return f'<GitHubRepo {self.repo_name}>'




class Site(db.Model):
    __tablename__ = 'site'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)
    site_type = db.Column(db.String(20), nullable=False, default='web')
    html_content = db.Column(db.Text,
                             nullable=False,
                             default='<h1>Welcome to my site!</h1>')
    python_content = db.Column(db.Text,
                               nullable=False,
                               default='print("Hello, World!")')
    bash_content = db.Column(db.Text,
                             nullable=False,
                             default='echo "Welcome to Bash Space!"')
    is_public = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime,
                           default=datetime.utcnow,
                           onupdate=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('sites', lazy=True))
    view_count = db.Column(db.Integer, default=0)
    analytics_enabled = db.Column(db.Boolean, default=False)

    def __init__(self, *args, **kwargs):
        if 'slug' not in kwargs and 'name' in kwargs:
            # Create our own slug without relying on the external slugify function
            name = str(kwargs.get('name', ''))
            import re
            # Convert to lowercase
            slug = name.lower()
            # Remove non-word characters and replace spaces with hyphens
            slug = re.sub(r'[^\w\s-]', '', slug)
            slug = re.sub(r'\s+', '-', slug)
            # Remove leading/trailing hyphens
            slug = slug.strip('-')
            kwargs['slug'] = slug
        super(Site, self).__init__(*args, **kwargs)

    def __repr__(self):
        return f'<Site {self.name}>'

    def get_page_content(self, filename):
        """Get the content of a specific page."""
        page = SitePage.query.filter_by(site_id=self.id, filename=filename).first()
        return page.content if page else None


class SitePage(db.Model):
    __tablename__ = 'site_page'
    id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.Integer, db.ForeignKey('site.id', ondelete='CASCADE'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    file_type = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    site = db.relationship('Site', backref=db.backref('pages', lazy=True, cascade='all, delete-orphan'))

    __table_args__ = (db.UniqueConstraint('site_id', 'filename', name='uix_site_page'),)

    def __repr__(self):
        return f'<SitePage {self.filename} for Site {self.site_id}>'


class BashFile(db.Model):
    __tablename__ = 'bash_file'
    id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.Integer, db.ForeignKey('site.id', ondelete='CASCADE'), nullable=False)
    path = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=True)
    is_directory = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    site = db.relationship('Site', backref=db.backref('bash_files', lazy=True, cascade='all, delete-orphan'))

    __table_args__ = (db.UniqueConstraint('site_id', 'path', name='uix_site_bash_file'),)

    def __repr__(self):
        return f'<BashFile {self.path} for Site {self.site_id}>'