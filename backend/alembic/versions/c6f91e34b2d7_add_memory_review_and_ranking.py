"""add memory review and ranking fields

Revision ID: c6f91e34b2d7
Revises: a8ead4e795fe
Create Date: 2026-07-18 22:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c6f91e34b2d7"
down_revision: Union[str, None] = "a8ead4e795fe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Server defaults preserve existing manual and already-extracted memories as
    # usable records when upgrading an existing SQLite database.
    with op.batch_alter_table("memories", recreate="always") as batch_op:
        batch_op.add_column(
            sa.Column("review_status", sa.String(length=20), nullable=False, server_default="approved")
        )
        batch_op.add_column(
            sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0")
        )
        batch_op.add_column(sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_memories_review_status", ["review_status"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("memories", recreate="always") as batch_op:
        batch_op.drop_index("ix_memories_review_status")
        batch_op.drop_column("last_used_at")
        batch_op.drop_column("usage_count")
        batch_op.drop_column("review_status")
