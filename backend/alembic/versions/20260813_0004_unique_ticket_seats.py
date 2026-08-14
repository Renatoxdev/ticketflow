"""add unique active ticket seats

Revision ID: 20260813_0004
Revises: 20260812_0003
Create Date: 2026-08-13 00:04:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260813_0004"
down_revision: str | None = "20260812_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_tickets_event_seat",
        "tickets",
        ["event_id", "seat_label"],
        unique=True,
        postgresql_where=sa.text("seat_label IS NOT NULL AND status IN ('VALID', 'USED')"),
    )


def downgrade() -> None:
    op.drop_index("uq_tickets_event_seat", table_name="tickets")
