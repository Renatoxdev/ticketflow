"""add pending payment reservations

Revision ID: 20260813_0005
Revises: 20260813_0004
Create Date: 2026-08-13 00:05:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260813_0005"
down_revision: str | None = "20260813_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now() + interval '15 minutes'"),
            nullable=False,
        ),
    )
    op.alter_column("payments", "expires_at", server_default=None)
    op.create_index(
        "uq_pending_payments_event_seat",
        "payments",
        ["event_id", "seat_label"],
        unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )


def downgrade() -> None:
    op.drop_index("uq_pending_payments_event_seat", table_name="payments")
    op.drop_column("payments", "expires_at")
