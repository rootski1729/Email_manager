"""merge heads

Revision ID: 699095ba00a7
Revises: add_user_names_fields, e60b24afc607
Create Date: 2025-11-08 23:21:44.543505

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '699095ba00a7'
down_revision: Union[str, None] = ('add_user_names_fields', 'e60b24afc607')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
