"""Version history as a graph: branches, parents, forks.

Every version gets the version it was taken on top of (``parent_id``) and the
branch it belongs to. A document is on one branch at a time
(``lesson_plans.current_branch_id``); a fork is a branch whose first version's
parent is a version on another branch. ``merged_from_id`` and
``restored_from_id`` are the second edge a merge or a restore draws.

Existing histories become one branch, "main", chained oldest to newest.

One statement per ``op.execute``: asyncpg refuses several in one call.

Revision ID: 0004_version_graph
Revises: 0003_versions_ai_collaborators
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_version_graph"
down_revision: Union[str, None] = "0003_versions_ai_collaborators"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_branches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("lesson_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("head_version_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("document_branches_plan_idx", "document_branches", ["plan_id"])

    op.add_column("document_versions", sa.Column("branch_id", sa.Integer(), nullable=True))
    op.add_column("document_versions", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.add_column("document_versions", sa.Column("merged_from_id", sa.Integer(), nullable=True))
    op.add_column("document_versions", sa.Column("restored_from_id", sa.Integer(), nullable=True))
    op.add_column(
        "document_versions",
        sa.Column("source", sa.String(length=16), nullable=False, server_default="human"),
    )
    op.create_foreign_key(
        "document_versions_branch_fk", "document_versions", "document_branches", ["branch_id"], ["id"],
        ondelete="CASCADE",
    )
    for column in ("parent_id", "merged_from_id", "restored_from_id"):
        op.create_foreign_key(
            f"document_versions_{column}_fk", "document_versions", "document_versions", [column], ["id"],
            ondelete="SET NULL",
        )
    op.create_foreign_key(
        "document_branches_head_fk", "document_branches", "document_versions", ["head_version_id"], ["id"],
        ondelete="SET NULL",
    )
    op.add_column("lesson_plans", sa.Column("current_branch_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "lesson_plans_current_branch_fk", "lesson_plans", "document_branches", ["current_branch_id"], ["id"],
        ondelete="SET NULL",
    )

    # Existing histories: one "main" per document, its versions chained by time.
    op.execute(
        "INSERT INTO document_branches (plan_id, name, created_by, created_at) "
        "SELECT plan_id, 'main', min(created_by), min(created_at) FROM document_versions GROUP BY plan_id"
    )
    op.execute(
        "UPDATE document_versions v SET branch_id = b.id FROM document_branches b WHERE b.plan_id = v.plan_id"
    )
    op.execute(
        "UPDATE document_versions v SET parent_id = chain.prev FROM ("
        "SELECT id, lag(id) OVER (PARTITION BY plan_id ORDER BY created_at, id) AS prev FROM document_versions"
        ") chain WHERE chain.id = v.id"
    )
    op.execute(
        "UPDATE document_branches b SET head_version_id = ("
        "SELECT v.id FROM document_versions v WHERE v.branch_id = b.id ORDER BY v.created_at DESC, v.id DESC LIMIT 1)"
    )
    op.execute(
        "UPDATE lesson_plans p SET current_branch_id = b.id FROM document_branches b WHERE b.plan_id = p.id"
    )
    op.create_index("document_versions_branch_idx", "document_versions", ["branch_id", "created_at"])


def downgrade() -> None:
    op.drop_index("document_versions_branch_idx", table_name="document_versions")
    op.drop_constraint("lesson_plans_current_branch_fk", "lesson_plans", type_="foreignkey")
    op.drop_column("lesson_plans", "current_branch_id")
    op.drop_constraint("document_branches_head_fk", "document_branches", type_="foreignkey")
    for column in ("parent_id", "merged_from_id", "restored_from_id"):
        op.drop_constraint(f"document_versions_{column}_fk", "document_versions", type_="foreignkey")
    op.drop_constraint("document_versions_branch_fk", "document_versions", type_="foreignkey")
    for column in ("source", "restored_from_id", "merged_from_id", "parent_id", "branch_id"):
        op.drop_column("document_versions", column)
    op.drop_index("document_branches_plan_idx", table_name="document_branches")
    op.drop_table("document_branches")
