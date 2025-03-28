"""Disable Python spaces and delete existing ones

Revision ID: disable_python_spaces
Revises: 8b430b165793
Create Date: 2025-03-14 22:08:55.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# revision identifiers, used by Alembic.
revision = 'disable_python_spaces'
down_revision = '8b430b165793'
branch_labels = None
depends_on = None

def upgrade():
    # Delete all existing Python spaces
    conn = op.get_bind()
    conn.execute(text("DELETE FROM site WHERE site_type = 'python'"))
    
    # Add a check constraint to prevent creation of Python spaces
    op.create_check_constraint(
        'site_type_check',
        'site',
        sa.text("site_type = 'web'")
    )

def downgrade():
    # Remove the check constraint
    op.drop_constraint('site_type_check', 'site')
