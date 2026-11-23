from langchain_core.tools import tool
from agents.vqe_agent import run_vqe

@tool
def vqe_optimize() -> dict:
    """Find the ground-state energy of a two-qubit Hamiltonian using VQE."""
    return run_vqe()
