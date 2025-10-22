"""add_unique_priority_constraint_and_support_list_conditions

Revision ID: 4fd04db161dd
Revises: b7ad293e1f68
Create Date: 2025-10-18 00:59:12.878423

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4fd04db161dd'
down_revision: Union[str, None] = 'b7ad293e1f68'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add unique constraint on (user_id, priority) for email_filters table
    op.create_unique_constraint(
        'uq_user_priority',
        'email_filters',
        ['user_id', 'priority']
    )


def downgrade() -> None:
    # Remove the unique constraint
    op.drop_constraint('uq_user_priority', 'email_filters', type_='unique')
