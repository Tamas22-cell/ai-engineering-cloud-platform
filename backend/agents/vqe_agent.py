from math import pi

import numpy as np
from scipy.optimize import minimize
from qiskit import QuantumCircuit
from qiskit.quantum_info import SparsePauliOp, Statevector

H = SparsePauliOp.from_list([
    ("ZZ", -1.0),
    ("XI", -0.5),
    ("IX", -0.5),
])


def ansatz(params):
    qc = QuantumCircuit(2)
    qc.ry(float(params[0]), 0)
    qc.ry(float(params[1]), 1)
    qc.cx(0, 1)
    qc.ry(float(params[2]), 0)
    qc.ry(float(params[3]), 1)
    return qc


def energy(params):
    state = Statevector.from_instruction(ansatz(params))
    return float(np.real(state.expectation_value(H)))


def run_vqe():
    best = None

    for seed in range(5):
        rng = np.random.default_rng(seed)
        initial = rng.uniform(-pi, pi, 4)

        result = minimize(
            energy,
            initial,
            method="COBYLA",
            options={"maxiter": 500, "tol": 1e-8},
        )

        if best is None or result.fun < best.fun:
            best = result

    exact = float(np.linalg.eigvalsh(H.to_matrix())[0])

    return {
        "status": "success",
        "algorithm": "VQE",
        "qubits": 2,
        "ground_state_energy": round(float(best.fun), 6),
        "exact_energy": round(exact, 6),
        "absolute_error": round(abs(float(best.fun) - exact), 6),
        "parameters": [round(float(x), 6) for x in best.x],
    }


if __name__ == "__main__":
    print(run_vqe())
