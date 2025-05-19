from app import app, db
from sqlalchemy import text
from models import User, Site, SitePage, UserActivity, Club, ClubMembership
from models import ClubPost, ClubAssignment, ClubResource, ClubChatChannel, ClubChatMessage

def setup_database():
    """Create all database tables if they don't exist."""
    with app.app_context():
        print("Creating database tables...")
        db.create_all()
        print("Database tables created successfully.")

        # Create default chat channels for existing clubs if they don't have any
        clubs = Club.query.all()
        for club in clubs:
            # Check if club already has channels
            existing_channels = ClubChatChannel.query.filter_by(club_id=club.id).count()
            if existing_channels == 0:
                # Create default channels
                default_channels = [
                    {"name": "general", "description": "General discussions"},
                    {"name": "announcements", "description": "Important announcements"},
                    {"name": "help", "description": "Get help with your projects"}
                ]

                for channel_data in default_channels:
                    channel = ClubChatChannel(
                        club_id=club.id,
                        name=channel_data["name"],
                        description=channel_data["description"],
                        created_by=club.leader_id
                    )
                    db.session.add(channel)

                    db.session.commit()

                    # Now add welcome message after the channel is committed
                    welcome_message = ClubChatMessage(
                        channel_id=channel.id,
                        user_id=club.leader_id,
                        content=f"Welcome to the {club.name} chat!"
                    )
                    db.session.add(welcome_message)

                db.session.commit()
                print(f"Created default channels for club: {club.name}")

        print("Database setup complete.")

if __name__ == "__main__":
    setup_database()