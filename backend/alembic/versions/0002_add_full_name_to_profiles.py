"""add full_name to profiles

Revision ID: 0002_add_full_name_to_profiles
Revises: 0001_initial_schema
Create Date: 2026-01-09 00:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0002_add_full_name_to_profiles"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("full_name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "full_name")
