"""Regression tests for persistent, user-scoped Agent Memory."""
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from agents import postgres_memory


@pytest.mark.asyncio
async def test_workflow_memory_is_user_scoped(monkeypatch):
    # Test the SQL parameterization without needing a live database.
    statements = []
    class Result:
        def first(self):
            return ([{"role": "user", "content": "saved"}],)
    class Connection:
        async def execute(self, statement, params=None):
            statements.append((str(statement), params))
            return Result()
    class Context:
        async def __aenter__(self):
            return Connection()
        async def __aexit__(self, *args):
            return False
    class Engine:
        def begin(self):
            return Context()
    monkeypatch.setattr(postgres_memory, "engine", Engine())
    thread = str(uuid4())
    history = await postgres_memory.load_history("user-a", thread)
    assert history[0]["content"] == "saved"
    assert statements[-1][1] == {"user_id": "user-a", "thread_id": thread}
    await postgres_memory.save_history("user-a", thread, history)
    assert statements[-1][1]["user_id"] == "user-a"
    assert statements[-1][1]["thread_id"] == thread
    assert "saved" in statements[-1][1]["history"]
