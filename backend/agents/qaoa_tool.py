from langchain_core.tools import tool
from agents.qaoa_agent import run_qaoa

@tool
def qaoa_optimize() -> dict:
    """Solve a three-node Max-Cut optimization problem using QAOA."""
    return run_qaoa()
