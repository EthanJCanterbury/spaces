
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
            
            # First, run explicit updates for languages that might have incorrect extensions
            print("Updating specific language extensions...")
            
            # List of languages to ensure they have proper extensions
            language_updates = [
                ('python', 'py'), ('javascript', 'js'), ('typescript', 'ts'),
                ('java', 'java'), ('c', 'c'), ('c++', 'cpp'), ('cpp', 'cpp'),
                ('csharp', 'cs'), ('go', 'go'), ('ruby', 'rb'), ('rust', 'rs'),
                ('php', 'php'), ('swift', 'swift'), ('kotlin', 'kt'), ('dart', 'dart'),
                ('scala', 'scala'), ('haskell', 'hs'), ('elixir', 'ex'), ('erlang', 'erl'),
                ('clojure', 'clj'), ('lisp', 'lisp'), ('racket', 'rkt'), ('fsharp.net', 'fs'),
                ('ocaml', 'ml'), ('zig', 'zig'), ('nim', 'nim'), ('crystal', 'cr'),
                ('groovy', 'groovy'), ('basic', 'bas'), ('fortran', 'f90'), ('cobol', 'cbl'),
                ('pascal', 'pas'), ('lua', 'lua'), ('perl', 'pl'), ('r', 'r'), ('rscript', 'r'),
                ('bash', 'sh'), ('powershell', 'ps1'), ('julia', 'jl'), ('coffeescript', 'coffee'),
                ('d', 'd'), ('prolog', 'pl'), ('smalltalk', 'st'), ('sqlite3', 'sql')
            ]
            
            # Run individual updates for each language to ensure proper extension
            for lang, ext in language_updates:
                conn.execute(text("""
                    UPDATE site
                    SET slug = regexp_replace(slug, '\\.txt$', '', 'i') || '.' || :ext
                    WHERE language = :lang
                    AND (slug ~ '\\.txt$' OR NOT slug ~ '\\.[a-zA-Z0-9]+$')
                """), {"lang": lang, "ext": ext})
                
            # Now, update any remaining sites with extensions from the temp table
            print("Updating remaining site slugs with correct file extensions...")
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
            
            # Also update any sites that still have .txt extensions to use proper ones
            conn.execute(text("""
                UPDATE site AS s
                SET slug = regexp_replace(slug, '\\.txt$', '', 'i') || '.' || te.extension
                FROM temp_language_extensions AS te
                WHERE s.language = te.language
                AND s.slug ~ '\\.txt$' 
                AND te.extension != 'txt'
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
