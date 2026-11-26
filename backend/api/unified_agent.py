import logging
import time

from agents.monitoring_auth import require_monitoring_key
from agents.unified_agent import create_unified_agent
from agents.monitoring import record_run, get_metrics
from core.dependencies import get_current_user
from core.rate_limit import rate_limit
from fastapi import APIRouter, HTTPException, Depends
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

router = APIRouter(prefix="/agent", tags=["Unified AI Agent"])
logger = logging.getLogger(__name__)


class AgentRequest(BaseModel):
    message: str


async def require_agent_access(
    user=Depends(get_current_user),
    _rate_limit=Depends(rate_limit(5)),
):
    return user


@router.post("/invoke", dependencies=[Depends(require_agent_access)])
async def invoke_agent(request: AgentRequest):
    start = time.perf_counter()
    tools_used = []

    try:
        agent = await create_unified_agent()
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=request.message)]},
            config={"recursion_limit": 6}
        )

        tools_used = [
            m.name for m in result["messages"]
            if m.type == "tool"
        ]

        return {
            "response": str(result["messages"][-1].content),
            "tools_used": tools_used
        }

    except Exception:
        logger.exception("agent_execution_failed")
        raise HTTPException(
            status_code=500,
            detail="Agent execution failed"
        )

    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        record_run(
            duration_ms=duration_ms,
            tools_used=tools_used,
            success=not bool(__import__("sys").exc_info()[0])
        )


@router.get("/metrics", dependencies=[Depends(require_monitoring_key)])
async def agent_metrics():
    return get_metrics()
