from langchain_core.tools import tool
from agents.quantum_agent import create_bell_circuit

@tool
def quantum_bell() -> dict:
    """Create a two-qubit Bell-state quantum circuit using Qiskit."""
    return create_bell_circuit()
