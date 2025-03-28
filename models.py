from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from slugify import slugify

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
    slack_id = db.Column(db.String(50), nullable=True)
    is_suspended = db.Column(db.Boolean, default=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_club_leader = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'


class Club(db.Model):
    __tablename__ = 'club'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    location = db.Column(db.String(150), nullable=True)
    meeting_day = db.Column(db.String(20), nullable=True)
    meeting_time = db.Column(db.String(20), nullable=True)
    join_code = db.Column(db.String(10), nullable=True, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    leader_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    leader = db.relationship('User', backref=db.backref('club', uselist=False))
    
    def __repr__(self):
        return f'<Club {self.name}>'
        
        
class ClubMember(db.Model):
    __tablename__ = 'club_member'
    id = db.Column(db.Integer, primary_key=True)
    club_id = db.Column(db.Integer, db.ForeignKey('club.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    role = db.Column(db.String(50), default='member')
    
    club = db.relationship('Club', backref=db.backref('members', lazy='dynamic'))
    user = db.relationship('User', backref=db.backref('club_memberships', lazy='dynamic'))
    
    __table_args__ = (db.UniqueConstraint('club_id', 'user_id', name='unique_club_membership'),)


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
        
class SiteCollaborator(db.Model):
    __tablename__ = 'site_collaborator'
    id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.Integer, db.ForeignKey('site.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_active = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=False)
    
    user = db.relationship('User', backref=db.backref('site_collaborations', lazy='dynamic', cascade='all, delete-orphan'))
    
    __table_args__ = (db.UniqueConstraint('site_id', 'user_id', name='unique_site_user_collab'),)
    
    def __repr__(self):
        return f'<SiteCollaborator site_id={self.site_id} user_id={self.user_id}>'


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
    is_public = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime,
                           default=datetime.utcnow,
                           onupdate=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('sites', lazy=True))
    view_count = db.Column(db.Integer, default=0)
    analytics_enabled = db.Column(db.Boolean, default=False)
    collaborators = db.relationship('SiteCollaborator', backref='site', lazy='dynamic', cascade='all, delete-orphan')

    def __init__(self, *args, **kwargs):
        if 'slug' not in kwargs:
            kwargs['slug'] = slugify(kwargs.get('name', ''))
        super(Site, self).__init__(*args, **kwargs)

    def __repr__(self):
        return f'<Site {self.name}>'
