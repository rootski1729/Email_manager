"""ai assistant

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-07 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('user_settings', sa.Column('ai_enabled', sa.Boolean(), server_default=sa.text('true'),
                                             nullable=False))
    op.add_column('messages', sa.Column('ai_summary', sa.Text(), nullable=True))
    op.add_column('messages', sa.Column('ai_action', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'ai_action')
    op.drop_column('messages', 'ai_summary')
    op.drop_column('user_settings', 'ai_enabled')
