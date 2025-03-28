
from models import db, User

def get_admins():
    """Get the list of admin usernames from database"""
    try:
        admin_users = User.query.filter_by(is_admin=True).all()
        return [user.username for user in admin_users]
    except Exception as e:
        print(f"Error getting admins from database: {str(e)}")
        return []

def add_admin(username):
    """Add a new admin to database"""
    try:
        user = User.query.filter_by(username=username).first()
        if not user:
            return False
            
        if not user.is_admin:
            user.is_admin = True
            db.session.commit()
            return True
        return False
    except Exception as e:
        print(f"Error adding admin: {str(e)}")
        db.session.rollback()
        return False

def remove_admin(username):
    """Remove an admin from database"""
    try:
        user = User.query.filter_by(username=username).first()
        if not user:
            return False
            
        if user.is_admin:
            user.is_admin = False
            db.session.commit()
            return True
        return False
    except Exception as e:
        print(f"Error removing admin: {str(e)}")
        db.session.rollback()
        return False

def is_admin(username):
    """Check if a username is an admin in the database"""
    try:
        user = User.query.filter_by(username=username).first()
        return user and user.is_admin
    except Exception as e:
        print(f"Error checking admin status: {str(e)}")
        return False
