"""deleted two field

Revision ID: ca2789f52476
Revises: 55b0b7fbae4d
Create Date: 2025-10-24 00:24:27.499841

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca2789f52476'
down_revision: Union[str, None] = '55b0b7fbae4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
