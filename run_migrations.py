#!/usr/bin/env python3
"""
Script to run database migrations for Hack Club Spaces.
"""

import os
import sys
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_migrations():
    """Run all pending migrations."""
    logger.info("Starting database migrations")
    
    # Import the Flask app and create an application context
    from app import app, db
    
    # Import the migration modules
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'migrations')))
    
    try:
        # Create an application context
        with app.app_context():
            # Import and run the language support migration
            logger.info("Running add_language_support migration")
            from migrations.add_language_support import run_migration as run_language_migration
            success = run_language_migration()
            
            if success:
                logger.info("Language support migration completed successfully")
            else:
                logger.error("Language support migration failed")
                return False
                
            logger.info("All migrations completed successfully")
            return True
        
    except Exception as e:
        logger.error(f"Error running migrations: {str(e)}")
        return False

if __name__ == "__main__":
    run_migrations()
