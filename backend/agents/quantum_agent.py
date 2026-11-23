from qiskit import QuantumCircuit

def create_bell_circuit():
    circuit = QuantumCircuit(2)
    circuit.h(0)
    circuit.cx(0, 1)

    return {
        "status": "success",
        "qubits": circuit.num_qubits,
        "depth": circuit.depth(),
        "circuit": str(circuit.draw(output="text")),
    }
