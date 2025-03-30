
from app import app, db
from flask import jsonify
from models import User, Club, ClubMembership

def initialize_database():
    """Initialize the database and create all tables."""
    try:
        print("Initializing database...")
        with app.app_context():
            db.create_all()
        print("Database initialized successfully.")
        return True
    except Exception as e:
        app.logger.warning(f"Database initialization error: {e}")
        return False

@app.route('/')
def home():
    return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    try:
        initialize_database()
    except Exception as e:
        app.logger.warning(f"Database initialization error: {e}")
    app.run(host='0.0.0.0', port=3000, debug=True)
