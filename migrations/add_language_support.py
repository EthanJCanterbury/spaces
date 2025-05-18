"""
Migration script to add language support to the Site model.
This script will:
1. Add new columns: language, language_version, language_content
2. Migrate existing Python spaces to use the new schema
"""

import os
import sys
from datetime import datetime
import logging

# Add the parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from models import db, Site

def run_migration():
    """Run the migration to add language support."""
    print("Starting migration to add language support...")
    
    try:
        # Add columns if they don't exist
        from sqlalchemy import text
        from sqlalchemy.exc import SQLAlchemyError
        
        with db.engine.connect() as conn:
            # Check if language column exists
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='site' AND column_name='language'"))
            if result.rowcount == 0:
                print("Adding language column...")
                conn.execute(text("ALTER TABLE site ADD COLUMN language VARCHAR(50)"))
            
            # Check if language_version column exists
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='site' AND column_name='language_version'"))
            if result.rowcount == 0:
                print("Adding language_version column...")
                conn.execute(text("ALTER TABLE site ADD COLUMN language_version VARCHAR(20)"))
            
            # Check if language_content column exists
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='site' AND column_name='language_content'"))
            if result.rowcount == 0:
                print("Adding language_content column...")
                conn.execute(text("ALTER TABLE site ADD COLUMN language_content TEXT"))
            
            # Migrate existing Python spaces
            print("Migrating existing Python spaces...")
            conn.execute(text("""
                UPDATE site 
                SET language = 'python', 
                    language_version = '3.10.0', 
                    language_content = python_content 
                WHERE site_type = 'python' AND language IS NULL
            """))
            
            # Check if migrations table exists, create if not
            print("Checking migrations table...")
            try:
                # Try to create migrations table if it doesn't exist
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS migrations (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        applied_at TIMESTAMP NOT NULL
                    )
                """))
                
                # Log the migration
                print("Logging migration...")
                conn.execute(
                    text("INSERT INTO migrations (name, applied_at) VALUES (:name, :applied_at)"),
                    {"name": "add_language_support", "applied_at": datetime.utcnow()}
                )
            except Exception as e:
                print(f"Warning: Could not log migration: {str(e)}")
                # Continue anyway since the actual schema changes were made
            
            # Commit the transaction
            conn.commit()
            
        print("Migration completed successfully!")
        return True
    
    except Exception as e:
        print(f"Error during migration: {str(e)}")
        return False

if __name__ == "__main__":
    run_migration()
