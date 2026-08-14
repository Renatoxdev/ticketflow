"""seats and cancellations

Revision ID: 20260812_0002
Revises: 20260810_0001
Create Date: 2026-08-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260812_0002"
down_revision: str | Sequence[str] | None = "20260810_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'CANCELLED'")
    op.execute("ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'CANCELLED'")
    op.add_column("tickets", sa.Column("seat_label", sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "seat_label")
