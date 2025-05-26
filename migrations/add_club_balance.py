
import os
import psycopg2
from urllib.parse import urlparse

def run_migration():
    """Add balance column to clubs table"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("DATABASE_URL not found in environment variables")
        return False
    
    try:
        # Parse the database URL to handle connection pooling
        parsed_url = urlparse(database_url)
        
        # Connect to the database
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        
        # Check if balance column already exists
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='club' AND column_name='balance';
        """)
        
        if cur.fetchone():
            print("Balance column already exists in club table")
            return True
        
        # Add balance column to club table
        cur.execute("""
            ALTER TABLE club 
            ADD COLUMN balance DECIMAL(10,2) DEFAULT 0.00;
        """)
        
        # Update existing clubs to have a default balance of 0.00
        cur.execute("""
            UPDATE club SET balance = 0.00 WHERE balance IS NULL;
        """)
        
        conn.commit()
        print("Successfully added balance column to club table")
        return True
        
    except Exception as e:
        print(f"Error running migration: {str(e)}")
        if 'conn' in locals():
            conn.rollback()
        return False
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    run_migration()
