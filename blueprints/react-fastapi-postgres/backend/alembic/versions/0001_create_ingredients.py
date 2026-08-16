"""Create ingredients table."""

import sqlalchemy as sa

from alembic import op

revision = "0001_create_ingredients"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ingredients",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("unit", sa.String(length=24), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("reorder_level", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantity >= 0", name="ck_ingredients_quantity_nonnegative"),
        sa.CheckConstraint("reorder_level >= 0", name="ck_ingredients_reorder_nonnegative"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ingredients_name", "ingredients", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_ingredients_name", table_name="ingredients")
    op.drop_table("ingredients")
