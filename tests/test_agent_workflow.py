import pytest
from unittest.mock import AsyncMock
from langchain_core.messages import AIMessage

from agents import planner_executor_reviewer as workflow


@pytest.mark.asyncio
async def test_planner_executor_reviewer(monkeypatch):
    mock_llm = AsyncMock(
        side_effect=["Tesztterv", "Ellenőrzött végső válasz"]
    )
    mock_executor = AsyncMock(
        return_value={
            "messages": [
                AIMessage(content="Végrehajtás sikeres")
            ]
        }
    )

    monkeypatch.setattr(workflow, "generate_response", mock_llm)
    monkeypatch.setattr(workflow, "run_gpt_tool_agent", mock_executor)

    result = await workflow.run_planner_executor_reviewer(
        task="Tesztfeladat",
        thread_id="workflow-test-001",
    )

    assert result["plan"] == "Tesztterv"
    assert result["execution"] == "Végrehajtás sikeres"
    assert result["final_answer"] == "Ellenőrzött végső válasz"

    assert mock_llm.await_count == 2
    mock_executor.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["failed", "timeout"])
async def test_failed_workflow_recording_is_best_effort(monkeypatch, status):
    """A telemetry outage must not replace the original workflow failure."""
    from types import SimpleNamespace
    from uuid import uuid4
    from api import agents

    record = AsyncMock(side_effect=RuntimeError("database unavailable"))
    monkeypatch.setattr(agents, "record_workflow_run", record)

    await agents._record_failed_workflow(
        SimpleNamespace(id=uuid4()), uuid4(), "Tesztfeladat", status, 0.0
    )
    record.assert_awaited_once()
    assert record.await_args.args[3] == status


@pytest.mark.asyncio
async def test_workflow_timeout_is_recorded(monkeypatch):
    from types import SimpleNamespace
    from uuid import uuid4
    from fastapi import HTTPException
    from api import agents

    monkeypatch.setattr(agents, "load_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(agents, "run_planner_executor_reviewer", AsyncMock(side_effect=TimeoutError))
    monkeypatch.setattr(agents, "record_workflow_run", AsyncMock())

    with pytest.raises(HTTPException) as error:
        await agents.workflow_chat(
            agents.WorkflowRequest(task="Timeout teszt"), SimpleNamespace(id=uuid4())
        )
    assert error.value.status_code == 504
    assert agents.record_workflow_run.await_args.args[3] == "timeout"


@pytest.mark.asyncio
async def test_workflow_failure_is_recorded(monkeypatch):
    from types import SimpleNamespace
    from uuid import uuid4
    from fastapi import HTTPException
    from api import agents

    monkeypatch.setattr(agents, "load_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        agents, "run_planner_executor_reviewer",
        AsyncMock(side_effect=RuntimeError("simulated agent failure")),
    )
    monkeypatch.setattr(agents, "record_workflow_run", AsyncMock())

    with pytest.raises(HTTPException) as error:
        await agents.workflow_chat(
            agents.WorkflowRequest(task="Failure teszt"), SimpleNamespace(id=uuid4())
        )
    assert error.value.status_code == 503
    assert agents.record_workflow_run.await_args.args[3] == "failed"
