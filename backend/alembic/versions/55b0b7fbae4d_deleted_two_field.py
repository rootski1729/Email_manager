"""deleted two field

Revision ID: 55b0b7fbae4d
Revises: 0de0d1d122ae
Create Date: 2025-10-24 00:12:03.468021

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55b0b7fbae4d'
down_revision: Union[str, None] = '0de0d1d122ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
