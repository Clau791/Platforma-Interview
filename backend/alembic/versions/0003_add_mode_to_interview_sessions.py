"""add mode column to interview_sessions

Revision ID: 0003_add_session_mode
Revises: 0002_add_full_name_to_profiles
Create Date: 2026-03-29 00:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0003_add_session_mode"
down_revision = "0002_add_full_name_to_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column("mode", sa.String(length=20), nullable=False, server_default="normal"),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "mode")
