from app import app, db
from models import SiteCollaborator
from datetime import datetime
from sqlalchemy import Column, DateTime, Boolean

with app.app_context():
    inspector = db.inspect(db.engine)
    columns = [
        column['name'] for column in inspector.get_columns('site_collaborator')
    ]

    with db.engine.begin() as conn:
        if 'last_active' not in columns:
            print("Adding last_active column to site_collaborator table...")
            conn.execute(
                db.text(
                    "ALTER TABLE site_collaborator ADD COLUMN last_active TIMESTAMP DEFAULT NOW()"
                ))

        if 'is_active' not in columns:
            print("Adding is_active column to site_collaborator table...")
            conn.execute(
                db.text(
                    "ALTER TABLE site_collaborator ADD COLUMN is_active BOOLEAN DEFAULT FALSE"
                ))

    print("Database schema updated successfully!")
