"""Regression tests for AI agent timeout and error handling."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import api.agents as agent_api


@pytest.mark.asyncio
async def test_llm_agent_timeout(monkeypatch):
    async def timeout(_state):
        raise TimeoutError()
    monkeypatch.setattr(agent_api.llm_agent, "ainvoke", timeout)
    with pytest.raises(HTTPException) as exc:
        await agent_api.llm_chat(agent_api.ChatRequest(message="test"), user=object())
    assert exc.value.status_code == 504


@pytest.mark.asyncio
async def test_llm_agent_unavailable(monkeypatch):
    async def failure(_state):
        raise RuntimeError("hidden-key-value")
    monkeypatch.setattr(agent_api.llm_agent, "ainvoke", failure)
    with pytest.raises(HTTPException) as exc:
        await agent_api.llm_chat(agent_api.ChatRequest(message="test"), user=object())
    assert exc.value.status_code == 503
    assert "hidden-key-value" not in str(exc.value.detail)


@pytest.mark.asyncio
async def test_tool_agent_timeout(monkeypatch):
    async def timeout(_message):
        raise TimeoutError()
    monkeypatch.setattr(agent_api, "run_gpt_tool_agent", timeout)
    with pytest.raises(HTTPException) as exc:
        await agent_api.tool_chat(agent_api.ChatRequest(message="test"), user=object())
    assert exc.value.status_code == 504


@pytest.mark.asyncio
async def test_tool_agent_success(monkeypatch):
    async def success(_message):
        return {"messages": [SimpleNamespace(content="result")]}
    monkeypatch.setattr(agent_api, "run_gpt_tool_agent", success)
    response = await agent_api.tool_chat(agent_api.ChatRequest(message="test"), user=object())
    assert response.response == "result"


@pytest.mark.asyncio
async def test_tool_agent_unavailable(monkeypatch):
    async def failure(_message):
        raise ValueError("secret-internal-message")
    monkeypatch.setattr(agent_api, "run_gpt_tool_agent", failure)
    with pytest.raises(HTTPException) as exc:
        await agent_api.tool_chat(agent_api.ChatRequest(message="test"), user=object())
    assert exc.value.status_code == 503
    assert "secret-internal-message" not in str(exc.value.detail)
