"""initial schema

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2025-12-30 23:59:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("experience_level", sa.String(length=50), nullable=True),
        sa.Column("target_role", sa.String(length=120), nullable=True),
        sa.Column("technologies", sa.JSON(), nullable=True),
        sa.Column("preferences", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "interview_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "interview_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("interview_sessions.id"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
    )

    op.create_table(
        "emotion_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("interview_sessions.id"), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("emotion", sa.String(length=30), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
    )

    op.create_table(
        "code_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("interview_sessions.id"), nullable=False),
        sa.Column("language", sa.String(length=50), nullable=False),
        sa.Column("source_code", sa.Text(), nullable=False),
        sa.Column("stdout", sa.Text(), nullable=True),
        sa.Column("stderr", sa.Text(), nullable=True),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "interview_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("interview_sessions.id"), nullable=False),
        sa.Column("report_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("session_id"),
    )


def downgrade() -> None:
    op.drop_table("interview_reports")
    op.drop_table("code_runs")
    op.drop_table("emotion_snapshots")
    op.drop_table("interview_messages")
    op.drop_table("interview_sessions")
    op.drop_table("profiles")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
