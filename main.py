import os
import logging
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

# Configure simplified logging
logging.basicConfig(
    level=logging.WARNING,  # Changed from INFO to WARNING to reduce noise
    format='[%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Create console handler with a higher log level
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.WARNING)  # Changed from INFO to WARNING
formatter = logging.Formatter('[%(levelname)s] %(message)s')
console_handler.setFormatter(formatter)

# Add the handlers to the logger
app.logger.addHandler(console_handler)
app.logger.setLevel(logging.WARNING)  # Changed from INFO to WARNING

app.logger.info("Starting Hack Club Spaces application")

if __name__ == '__main__':
    try:
        initialize_database()
    except Exception as e:
        app.logger.warning(f"Database initialization error: {e}")
    port = int(os.environ.get('PORT', 3000))
    app.logger.info(f"Server running on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)