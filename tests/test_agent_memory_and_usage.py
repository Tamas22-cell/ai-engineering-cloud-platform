"""Regression tests for workflow context retention and token accounting."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage

from agents import planner_executor_reviewer as workflow
from agents import llm_client


@pytest.mark.asyncio
async def test_workflow_remembers_previous_turn(monkeypatch):
    llm = AsyncMock(side_effect=["Első terv", "Első válasz", "Második terv", "AGENT2026"])
    executor = AsyncMock(return_value={"messages": [AIMessage(content="Végrehajtva")]})
    monkeypatch.setattr(workflow, "generate_response", llm)
    monkeypatch.setattr(workflow, "run_gpt_tool_agent", executor)
    thread = str(uuid4())
    first = await workflow.run_planner_executor_reviewer(
        "Jegyezd meg: AGENT2026", thread_id=thread, history=[]
    )
    second = await workflow.run_planner_executor_reviewer(
        "Mi volt a tesztazonosító?", thread_id=thread, history=first["history"]
    )
    assert second["final_answer"] == "AGENT2026"
    assert len(second["history"]) == 4
    assert "AGENT2026" in llm.await_args_list[2].args[0]
    assert "AGENT2026" in executor.await_args_list[1].args[0]


@pytest.mark.asyncio
async def test_llm_token_usage_is_logged(monkeypatch):
    response = SimpleNamespace(
        output_text="OK",
        usage=SimpleNamespace(input_tokens=12, output_tokens=4, total_tokens=16),
    )
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(return_value=response)))
    from unittest.mock import Mock
    log = SimpleNamespace(info=Mock())
    monkeypatch.setattr(llm_client, "create_llm_client", lambda: client)
    monkeypatch.setattr(llm_client, "logger", log)
    assert await llm_client.generate_response("test") == "OK"
    log.info.assert_called_once_with(
        "agent_llm_token_usage", model="gpt-4.1-mini",
        input_tokens=12, output_tokens=4, total_tokens=16
    )
