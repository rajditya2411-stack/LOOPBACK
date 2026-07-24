"""Store per-user BYOK AI preferences."""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f15b7c2d9a01"
down_revision: Union[str, None] = "d9a41b5ce8f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_settings", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("ai_provider", sa.String(length=20), nullable=False, server_default="openai"))
        batch_op.add_column(sa.Column("ai_api_key", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("ai_streaming", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    with op.batch_alter_table("user_settings", recreate="always") as batch_op:
        batch_op.drop_column("ai_streaming")
        batch_op.drop_column("ai_api_key")
        batch_op.drop_column("ai_provider")
