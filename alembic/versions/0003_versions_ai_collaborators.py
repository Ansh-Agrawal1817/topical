"""Document versions, and AI collaborators on a document.

``document_versions`` holds whole-text snapshots of a document (see the model
for why snapshots rather than diffs). ``lesson_plans.ai_collaborators`` is the
list of AI models added to a document as reviewers — configuration only; the
API keys that run them never leave the browser that added them.

Revision ID: 0003_versions_ai_collaborators
Revises: 0002_in_house_auth
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_versions_ai_collaborators"
down_revision: Union[str, None] = "0002_in_house_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("lesson_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="auto"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("words", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("document_versions_plan_idx", "document_versions", ["plan_id", "created_at"])
    op.add_column(
        "lesson_plans",
        sa.Column("ai_collaborators", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lesson_plans", "ai_collaborators")
    op.drop_index("document_versions_plan_idx", table_name="document_versions")
    op.drop_table("document_versions")
