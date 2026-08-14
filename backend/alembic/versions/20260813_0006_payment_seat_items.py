"""add payment seat items

Revision ID: 20260813_0006
Revises: 20260813_0005
Create Date: 2026-08-13 00:06:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260813_0006"
down_revision: str | None = "20260813_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    payment_status = postgresql.ENUM("PENDING", "PAID", "FAILED", name="payment_status", create_type=False)

    op.drop_index("uq_pending_payments_event_seat", table_name="payments")

    op.create_table(
        "payment_seats",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("seat_label", sa.String(length=8), nullable=False),
        sa.Column("status", payment_status, nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_id", "seat_label", name="uq_payment_seats_payment_seat"),
        sa.UniqueConstraint("ticket_id"),
    )
    op.create_index(
        "uq_pending_payment_seats_event_seat",
        "payment_seats",
        ["event_id", "seat_label"],
        unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )

    op.execute(
        """
        INSERT INTO payment_seats (id, payment_id, event_id, seat_label, status, ticket_id)
        SELECT gen_random_uuid(), id, event_id, seat_label, status, ticket_id
        FROM payments
        WHERE seat_label IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("uq_pending_payment_seats_event_seat", table_name="payment_seats")
    op.drop_table("payment_seats")
    op.create_index(
        "uq_pending_payments_event_seat",
        "payments",
        ["event_id", "seat_label"],
        unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )
