"""Add manually recorded Render invoice totals."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e6f0b2914c73"
down_revision = "d4c8a71f209b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "render_billing_entries",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("invoice_number", sa.String(length=100), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_render_billing_entries_period", "render_billing_entries", ["period_start"])


def downgrade() -> None:
    op.drop_index("ix_render_billing_entries_period", table_name="render_billing_entries")
    op.drop_table("render_billing_entries")
