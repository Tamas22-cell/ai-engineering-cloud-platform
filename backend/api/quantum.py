from fastapi import APIRouter
from agents.quantum_agent import create_bell_circuit

router = APIRouter(prefix="/quantum", tags=["Quantum"])

@router.get("/bell")
def bell_circuit():
    return create_bell_circuit()
