"""Persist active-recall learning sessions."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
revision: str = "9ab1cd2e4f30"
down_revision: Union[str, None] = "f15b7c2d9a01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
def upgrade() -> None:
    op.create_table("learning_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic", sa.String(255), nullable=False, server_default="General understanding"),
        sa.Column("prompt", sa.Text(), nullable=False), sa.Column("explanation", sa.Text()),
        sa.Column("score", sa.Float()), sa.Column("accuracy", sa.Float()), sa.Column("quality", sa.Float()), sa.Column("difficulty", sa.String(30)),
        sa.Column("missing_concepts", sa.Text(), nullable=False, server_default="[]"), sa.Column("misconceptions", sa.Text(), nullable=False, server_default="[]"), sa.Column("strengths", sa.Text(), nullable=False, server_default="[]"), sa.Column("feedback", sa.Text()), sa.Column("follow_up_questions", sa.Text(), nullable=False, server_default="[]"), sa.Column("revision_recommendation", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_learning_sessions_user_id", "learning_sessions", ["user_id"])
    op.create_index("ix_learning_sessions_document_id", "learning_sessions", ["document_id"])
    op.create_index("ix_learning_sessions_created_at", "learning_sessions", ["created_at"])
def downgrade() -> None:
    op.drop_table("learning_sessions")
