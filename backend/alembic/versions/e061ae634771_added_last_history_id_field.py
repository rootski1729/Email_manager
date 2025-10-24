"""added last_history_id field

Revision ID: e061ae634771
Revises: b2b01d6e6b82
Create Date: 2025-10-23 16:02:48.506319

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e061ae634771'
down_revision: Union[str, None] = 'b2b01d6e6b82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
