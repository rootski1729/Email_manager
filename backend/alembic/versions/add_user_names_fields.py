"""Add first_name and last_name to User model

Revision ID: add_user_names_fields
Revises: b2b01d6e6b82
Create Date: 2025-11-08 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_user_names_fields'
down_revision = 'b2b01d6e6b82'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add first_name and last_name columns to users table
    op.add_column('users', sa.Column('first_name', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(100), nullable=True))


def downgrade() -> None:
    # Remove the columns if downgrading
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
