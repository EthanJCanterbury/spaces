
import os
import sys
from sqlalchemy import text
from dotenv import load_dotenv
from piston_service import PistonService

# Load environment variables
load_dotenv()

def get_database_url():
    url = os.getenv('DATABASE_URL')
    if url and url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    return url

def update_language_extensions():
    """Update the database with language extensions from PistonService"""
    try:
        from sqlalchemy import create_engine
        
        # Get database URL
        db_url = get_database_url()
        if not db_url:
            print("Error: DATABASE_URL environment variable not set")
            return False
            
        print(f"Connecting to database...")
        engine = create_engine(db_url)
        
        # Get languages and their extensions from PistonService
        languages = PistonService.get_languages()
        
        if not languages:
            print("Error: Could not fetch languages from PistonService")
            return False
            
        print(f"Found {len(languages)} languages in PistonService")
        
        # Connect to database
        with engine.connect() as conn:
            # First, create a temporary table to store language-extension mappings
            print("Creating temporary language mappings table...")
            conn.execute(text("""
                CREATE TEMPORARY TABLE temp_language_extensions (
                    language VARCHAR(50) PRIMARY KEY,
                    extension VARCHAR(10) NOT NULL
                )
            """))
            
            # Insert language-extension pairs
            for language in languages:
                extension = PistonService.get_language_extension(language)
                print(f"Language: {language}, Extension: {extension}")
                
                conn.execute(
                    text("INSERT INTO temp_language_extensions (language, extension) VALUES (:lang, :ext)"),
                    {"lang": language, "ext": extension}
                )
            
            # Update existing sites with correct file extensions
            print("Updating site slugs with correct file extensions...")
            conn.execute(text("""
                UPDATE site AS s
                SET slug = CASE
                    WHEN s.language IS NOT NULL AND s.language != '' AND NOT s.slug ~ '\\.[a-zA-Z0-9]+$' 
                    THEN s.slug || '.' || te.extension
                    ELSE s.slug
                END
                FROM temp_language_extensions AS te
                WHERE s.language = te.language
                AND NOT s.slug ~ '\\.[a-zA-Z0-9]+$'
            """))
            
            # Count updated rows
            result = conn.execute(text("""
                SELECT COUNT(*) FROM site 
                WHERE slug ~ '\\.[a-zA-Z0-9]+$'
            """))
            count = result.scalar()
            
            # Commit transaction
            conn.commit()
            
            print(f"Successfully updated {count} sites with correct file extensions")
            return True
            
    except Exception as e:
        print(f"Error updating language extensions: {str(e)}")
        return False

if __name__ == "__main__":
    print("Starting language extensions update...")
    success = update_language_extensions()
    if success:
        print("Language extensions update completed successfully")
    else:
        print("Language extensions update failed")
        sys.exit(1)
