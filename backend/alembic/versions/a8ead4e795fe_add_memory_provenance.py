"""add_memory_provenance

Revision ID: a8ead4e795fe
Revises: 37ceb062ab62
Create Date: 2026-07-18 21:37:35.617313

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8ead4e795fe'
down_revision: Union[str, None] = '37ceb062ab62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite cannot add foreign keys in place, so batch mode rebuilds the table.
    with op.batch_alter_table('memories', recreate='always') as batch_op:
        batch_op.add_column(sa.Column('source_chat_id', sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column('source_message_id', sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column('confidence', sa.Float(), nullable=True))
        batch_op.create_index('ix_memories_source_chat_id', ['source_chat_id'], unique=False)
        batch_op.create_index('ix_memories_source_message_id', ['source_message_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_memories_source_chat_id_chats', 'chats', ['source_chat_id'], ['id'], ondelete='SET NULL'
        )
        batch_op.create_foreign_key(
            'fk_memories_source_message_id_messages', 'messages', ['source_message_id'], ['id'], ondelete='SET NULL'
        )


def downgrade() -> None:
    with op.batch_alter_table('memories', recreate='always') as batch_op:
        batch_op.drop_constraint('fk_memories_source_message_id_messages', type_='foreignkey')
        batch_op.drop_constraint('fk_memories_source_chat_id_chats', type_='foreignkey')
        batch_op.drop_index('ix_memories_source_message_id')
        batch_op.drop_index('ix_memories_source_chat_id')
        batch_op.drop_column('confidence')
        batch_op.drop_column('source_message_id')
        batch_op.drop_column('source_chat_id')
