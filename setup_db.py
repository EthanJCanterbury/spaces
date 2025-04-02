from app import app, db
from models import User, Site, SitePage, UserActivity, Club, ClubMembership
from sqlalchemy.exc import OperationalError, ProgrammingError, IntegrityError

def setup_database():
    try:
        with app.app_context():
            try:
                db.create_all()
                print("✅ Successfully created all database tables")

                db.session.execute("""
                    DO $$ 
                    BEGIN
                        BEGIN
                            ALTER TABLE "user" ADD COLUMN github_token TEXT;
                        EXCEPTION
                            WHEN duplicate_column THEN 
                                NULL;
                        END;
                    END $$;
                """)
                db.session.commit()
                print("✅ Successfully added github_token column to user table")

                db.session.execute("""
                    CREATE TABLE IF NOT EXISTS github_repo (
                        id SERIAL PRIMARY KEY,
                        repo_name VARCHAR(100) NOT NULL,
                        repo_url VARCHAR(200) NOT NULL,
                        is_private BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        site_id INTEGER NOT NULL REFERENCES site(id) ON DELETE CASCADE,
                        UNIQUE(site_id)
                    );
                    
                    -- Create or replace the update trigger function
                    CREATE OR REPLACE FUNCTION update_updated_at_column()
                    RETURNS TRIGGER AS $$
                    BEGIN
                        NEW.updated_at = CURRENT_TIMESTAMP;
                        RETURN NEW;
                    END;
                    $$ language 'plpgsql';
                    
                    -- Drop the trigger if it exists
                    DROP TRIGGER IF EXISTS update_github_repo_updated_at ON github_repo;
                    
                    -- Create the trigger
                    CREATE TRIGGER update_github_repo_updated_at
                        BEFORE UPDATE ON github_repo
                        FOR EACH ROW
                        EXECUTE FUNCTION update_updated_at_column();
                """)
                db.session.commit()
                print(
                    "✅ Successfully created GitHub repository table and trigger"
                )

                db.session.execute("""
                    CREATE TABLE IF NOT EXISTS user_activity (
                        id SERIAL PRIMARY KEY,
                        activity_type VARCHAR(50) NOT NULL,
                        message TEXT NOT NULL,
                        username VARCHAR(80),
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        user_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
                        site_id INTEGER REFERENCES site(id) ON DELETE SET NULL
                    );
                """)
                db.session.commit()
                print("✅ Successfully created user_activity table")

                db.session.execute("""
                    CREATE TABLE IF NOT EXISTS system_settings (
                        key VARCHAR(100) PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                """)
                db.session.commit()
                print("✅ Successfully created system_settings table")

                db.session.execute("""
                    INSERT INTO system_settings (key, value)
                    VALUES ('max_sites_per_user', '10')
                    ON CONFLICT (key) DO NOTHING;
                """)
                db.session.commit()
                print("✅ Successfully added default system settings")

                db.session.execute("""
                    DO $$ 
                    BEGIN
                        BEGIN
                            ALTER TABLE site ADD COLUMN view_count INTEGER DEFAULT 0;
                        EXCEPTION
                            WHEN duplicate_column THEN 
                                NULL;
                        END;
                        
                        BEGIN
                            ALTER TABLE site ADD COLUMN analytics_enabled BOOLEAN DEFAULT FALSE;
                        EXCEPTION
                            WHEN duplicate_column THEN 
                                NULL;
                        END;
                    END $$;
                """)
                db.session.commit()
                print("✅ Successfully added analytics columns to site table")

            except (OperationalError, ProgrammingError) as e:
                if 'already exists' in str(e):
                    print("✅ Tables already exist, skipping creation")
                else:
                    raise e

            test_user = User.query.filter_by(username='test_user').first()
            if not test_user:
                # Create test user with automatic access
                test_user = User(username='test_user',
                                 email='test@example.com',
                                 preview_code_verified=True)
                test_user.set_password('test123')
                db.session.add(test_user)

                test_site = Site(
                    name='Welcome Site',
                    user=test_user,
                    html_content='<h1>Welcome to my first site!</h1>',
                    is_public=True)
                db.session.add(test_site)

                try:
                    db.session.commit()
                    print("✅ Successfully added test data")
                except IntegrityError:
                    db.session.rollback()
                    print("ℹ️ Test data already exists, skipping")
            else:
                print("ℹ️ Test data already exists, skipping")

            print("✅ Database setup completed successfully!")

    except Exception as e:
        print(f"❌ Database setup failed: {str(e)}")


if __name__ == '__main__':
    setup_database()