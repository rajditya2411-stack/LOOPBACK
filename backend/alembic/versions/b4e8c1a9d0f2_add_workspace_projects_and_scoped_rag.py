"""Add workspace custom instructions and workspace_id to chats, memories, documents.

Revision ID: b4e8c1a9d0f2
Revises: 9ab1cd2e4f30
Create Date: 2026-11-16 15:38:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b4e8c1a9d0f2"
down_revision: Union[str, None] = "9ab1cd2e4f30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column_name in [c["name"] for c in insp.get_columns(table_name)]


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return index_name in [i["name"] for i in insp.get_indexes(table_name)]


def upgrade() -> None:
    if not _has_column("workspaces", "custom_instructions"):
        op.add_column("workspaces", sa.Column("custom_instructions", sa.Text(), nullable=True))

    if not _has_column("chats", "workspace_id"):
        op.add_column("chats", sa.Column("workspace_id", sa.String(36), nullable=True))
    if not _has_index("chats", "ix_chats_workspace_id"):
        op.create_index("ix_chats_workspace_id", "chats", ["workspace_id"])

    if not _has_column("memories", "workspace_id"):
        op.add_column("memories", sa.Column("workspace_id", sa.String(36), nullable=True))
    if not _has_index("memories", "ix_memories_workspace_id"):
        op.create_index("ix_memories_workspace_id", "memories", ["workspace_id"])

    if not _has_column("documents", "workspace_id"):
        op.add_column("documents", sa.Column("workspace_id", sa.String(36), nullable=True))
    if not _has_index("documents", "ix_documents_workspace_id"):
        op.create_index("ix_documents_workspace_id", "documents", ["workspace_id"])


def downgrade() -> None:
    with op.batch_alter_table("documents") as batch_op:
        batch_op.drop_index("ix_documents_workspace_id")
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("memories") as batch_op:
        batch_op.drop_index("ix_memories_workspace_id")
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("chats") as batch_op:
        batch_op.drop_index("ix_chats_workspace_id")
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("workspaces") as batch_op:
        batch_op.drop_column("custom_instructions")
