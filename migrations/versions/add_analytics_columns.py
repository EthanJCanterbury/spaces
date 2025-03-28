
"""Add analytics columns to site table

Revision ID: add_analytics_columns
Revises: remove_site_visit
Create Date: 2023-07-28 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_analytics_columns'
down_revision = 'remove_site_visit'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('site', sa.Column('view_count', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('site', sa.Column('analytics_enabled', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    op.drop_column('site', 'analytics_enabled')
    op.drop_column('site', 'view_count')
