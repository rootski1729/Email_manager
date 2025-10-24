"""added last_history_id field

Revision ID: 0de0d1d122ae
Revises: e061ae634771
Create Date: 2025-10-23 16:07:43.814677

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0de0d1d122ae'
down_revision: Union[str, None] = 'e061ae634771'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('connected_emails', sa.Column('last_history_id', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('connected_emails', 'last_history_id')
