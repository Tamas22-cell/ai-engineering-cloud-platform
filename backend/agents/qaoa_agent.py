from collections import Counter
from math import pi

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector
from scipy.optimize import minimize

EDGES = [(0, 1), (1, 2), (0, 2)]
N = 3


def cut_value(bits):
    return sum(bits[i] != bits[j] for i, j in EDGES)


def build_qaoa(gamma, beta):
    qc = QuantumCircuit(N)
    qc.h(range(N))

    for i, j in EDGES:
        qc.rzz(2 * gamma, i, j)

    for i in range(N):
        qc.rx(2 * beta, i)

    return qc


def probabilities(params):
    qc = build_qaoa(*params)
    return Statevector.from_instruction(qc).probabilities_dict()


def objective(params):
    return -sum(
        probability * cut_value([int(x) for x in bitstring[::-1]])
        for bitstring, probability in probabilities(params).items()
    )


def run_qaoa():
    best = None

    for gamma in [0.2, 0.6, 1.0]:
        for beta in [0.2, 0.6, 1.0]:
            result = minimize(
                objective,
                [gamma, beta],
                method="COBYLA",
                options={"maxiter": 150},
            )
            if best is None or result.fun < best.fun:
                best = result

    probs = probabilities(best.x)
    top = max(probs, key=probs.get)
    bits = [int(x) for x in top[::-1]]

    return {
        "status": "success",
        "algorithm": "QAOA",
        "problem": "Max-Cut",
        "qubits": N,
        "best_bitstring": top,
        "cut_value": cut_value(bits),
        "expected_cut": round(-best.fun, 6),
        "parameters": [round(float(x), 6) for x in best.x],
    }


if __name__ == "__main__":
    print(run_qaoa())
