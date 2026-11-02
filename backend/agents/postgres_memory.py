"""Persistent, user-scoped workflow history stored in PostgreSQL.

The table is created idempotently for the initial MVP; move the schema to
Alembic before the next production release.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import engine

_CREATE = """
CREATE TABLE IF NOT EXISTS agent_workflow_history (
    user_id VARCHAR(36) NOT NULL,
    thread_id VARCHAR(36) NOT NULL,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, thread_id)
)
"""


async def load_history(user_id: str, thread_id: str) -> list[dict[str, str]]:
    async with engine.begin() as connection:
        await connection.execute(text(_CREATE))
        result = await connection.execute(
            text("SELECT history FROM agent_workflow_history WHERE user_id=:user_id AND thread_id=:thread_id"),
            {"user_id": user_id, "thread_id": thread_id},
        )
        row = result.first()
        return row[0][-10:] if row else []


async def save_history(user_id: str, thread_id: str, history: list[dict[str, str]]) -> None:
    import json
    async with engine.begin() as connection:
        await connection.execute(text(_CREATE))
        await connection.execute(text("""
            INSERT INTO agent_workflow_history (user_id, thread_id, history, updated_at)
            VALUES (:user_id, :thread_id, CAST(:history AS jsonb), NOW())
            ON CONFLICT (user_id, thread_id) DO UPDATE SET
                history=EXCLUDED.history, updated_at=NOW()
        """), {"user_id": user_id, "thread_id": thread_id,
               "history": json.dumps(history[-10:], ensure_ascii=False)})
