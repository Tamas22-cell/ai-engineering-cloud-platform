"""Security regression tests for authenticated RAG access.

These tests use fake database sessions and never contact production services.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from core.config import settings
from core.dependencies import get_current_user
from rag.multi_agent import build_multi_agent_rag


class FakeResult:
    def __init__(self, user):
        self.user = user

    def scalar_one_or_none(self):
        return self.user


def fake_db(user):
    return SimpleNamespace(execute=AsyncMock(return_value=FakeResult(user)))


@pytest.mark.asyncio
async def test_missing_access_token_is_rejected():
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials=None, db=fake_db(None))
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_cannot_authenticate_rag():
    token = jwt.encode(
        {"sub": "user-a", "type": "refresh"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    db = fake_db(SimpleNamespace(id="user-a", is_active=True))
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials=credentials, db=db)
    assert error.value.status_code == 401
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_inactive_user_is_rejected():
    token = jwt.encode(
        {"sub": "user-a", "type": "access"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    db = fake_db(SimpleNamespace(id="user-a", is_active=False))
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials=credentials, db=db)
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_unknown_user_is_rejected():
    token = jwt.encode(
        {"sub": "missing-user", "type": "access"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials=credentials, db=fake_db(None))
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_retrieval_uses_authenticated_user_scope():
    db = SimpleNamespace()
    embeddings = SimpleNamespace(embed_texts=AsyncMock(return_value=[[0.1, 0.2]]))
    generator = SimpleNamespace()
    observed = {}

    async def scoped_search(*, db, user_id, query_embedding, top_k):
        observed["user_id"] = user_id
        observed["top_k"] = top_k
        return []

    from unittest.mock import patch
    with patch("rag.multi_agent.search_stored_documents", new=scoped_search):
        graph = build_multi_agent_rag(
            db, "user-a", embedding_service=embeddings, answer_generator=generator
        )
        result = await graph.ainvoke({
            "question": "What is in my document?",
            "top_k": 3,
            "query": "",
            "documents": [],
            "answer": "",
            "sources": [],
            "verified": False,
            "usage": {},
            "step_timings_ms": {},
        })

    assert observed == {"user_id": "user-a", "top_k": 3}
    assert result["verified"] is False
    assert result["sources"] == []
    assert "step_timings_ms" in result
