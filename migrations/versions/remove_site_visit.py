
"""remove site_visit table

Revision ID: remove_site_visit
Revises: 
Create Date: 2023-08-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'remove_site_visit'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('site_visit')


def downgrade():
    op.create_table('site_visit',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('site_id', sa.Integer(), nullable=True),
        sa.Column('visitor_ip', sa.String(length=50), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.Column('referrer', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['site_id'], ['site.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
