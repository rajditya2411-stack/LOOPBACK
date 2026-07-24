"""Store document processing errors for user-visible recovery.

Revision ID: e42d1267c9aa
Revises: a77407618213
Create Date: 2026-07-16 21:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e42d1267c9aa"
down_revision: Union[str, None] = "a77407618213"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("processing_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "processing_error")
