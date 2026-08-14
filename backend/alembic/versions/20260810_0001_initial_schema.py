"""initial schema

Revision ID: 20260810_0001
Revises:
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260810_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    user_role = postgresql.ENUM("ORGANIZER", "CUSTOMER", "GATE_OPERATOR", name="user_role", create_type=False)
    event_status = postgresql.ENUM("DRAFT", "PUBLISHED", name="event_status", create_type=False)
    ticket_status = postgresql.ENUM("VALID", "USED", name="ticket_status", create_type=False)
    checkout_status = postgresql.ENUM("CONFIRMED", name="checkout_status", create_type=False)

    user_role.create(op.get_bind(), checkfirst=True)
    event_status.create(op.get_bind(), checkfirst=True)
    ticket_status.create(op.get_bind(), checkfirst=True)
    checkout_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organizer_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(length=1000), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("venue", sa.String(length=200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", event_status, nullable=False),
        sa.Column("external_source", sa.String(length=50), nullable=True),
        sa.Column("external_id", sa.String(length=120), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("capacity > 0", name="ck_events_capacity_positive"),
        sa.CheckConstraint("price >= 0", name="ck_events_price_non_negative"),
        sa.ForeignKeyConstraint(["organizer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_events_status_starts_at", "events", ["status", "starts_at"])

    op.create_table(
        "tickets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("public_token", sa.String(length=96), nullable=False),
        sa.Column("status", ticket_status, nullable=False),
        sa.Column("checkout_status", checkout_status, nullable=False),
        sa.Column("checkout_reference", sa.Uuid(), nullable=False),
        sa.Column("paid_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("checkout_confirmed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("paid_amount >= 0", name="ck_tickets_paid_amount_non_negative"),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("checkout_reference"),
        sa.UniqueConstraint("public_token"),
    )
    op.create_index("ix_tickets_event_status", "tickets", ["event_id", "status"])
    op.create_index("ix_tickets_public_token", "tickets", ["public_token"])

    op.create_table(
        "check_ins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("gate_operator_id", sa.Uuid(), nullable=False),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["gate_operator_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_id", name="uq_check_ins_ticket_id"),
    )


def downgrade() -> None:
    op.drop_table("check_ins")
    op.drop_index("ix_tickets_public_token", table_name="tickets")
    op.drop_index("ix_tickets_event_status", table_name="tickets")
    op.drop_table("tickets")
    op.drop_index("ix_events_status_starts_at", table_name="events")
    op.drop_table("events")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    sa.Enum(name="checkout_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="ticket_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="event_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
