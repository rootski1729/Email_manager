"""added last_history_id field

Revision ID: b2b01d6e6b82
Revises: 6815664a327d
Create Date: 2025-10-23 15:59:06.301223

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2b01d6e6b82'
down_revision: Union[str, None] = '6815664a327d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
