from models import db, Site
from app import app

with app.app_context():
    count = Site.query.filter_by(is_collaborative=True).count()
    print(f"Found {count} sites with collaboration enabled")

    updated = Site.query.update({Site.is_collaborative: False})
    db.session.commit()

    print(f"Updated {updated} sites to disable collaboration by default")
