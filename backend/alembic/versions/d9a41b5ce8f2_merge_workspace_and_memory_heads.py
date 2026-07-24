"""merge workspace and memory intelligence migration heads

Revision ID: d9a41b5ce8f2
Revises: 942492abf516, c6f91e34b2d7
Create Date: 2026-07-18 22:16:00.000000

"""

from typing import Sequence, Union


revision: str = "d9a41b5ce8f2"
down_revision: Union[str, tuple[str, str], None] = ("942492abf516", "c6f91e34b2d7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
