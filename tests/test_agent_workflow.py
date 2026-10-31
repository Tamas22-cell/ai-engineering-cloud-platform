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
