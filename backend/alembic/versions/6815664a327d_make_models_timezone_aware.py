"""make models timezone aware

Revision ID: 6815664a327d
Revises: 3748e3f369de
Create Date: 2025-10-21 22:57:42.550995

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6815664a327d'
down_revision: Union[str, None] = '3748e3f369de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
