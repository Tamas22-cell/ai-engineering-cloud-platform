from itertools import product

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector
from scipy.optimize import minimize

EDGES = [(0, 1), (1, 2), (0, 2)]
N = 3


def cut_value(bits):
    return sum(bits[i] != bits[j] for i, j in EDGES)


def classical_max_cut():
    """Find the exact Max-Cut optimum by exhaustive search for this small graph."""
    candidates = (
        (cut_value(bits), "".join(map(str, bits)), bits)
        for bits in product((0, 1), repeat=N)
    )
    value, bitstring, _ = max(candidates, key=lambda candidate: candidate[0])
    return {
        "algorithm": "classical_exhaustive_search",
        "best_bitstring": bitstring,
        "cut_value": value,
    }


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
    observed_cut = cut_value(bits)
    expected_cut = round(-best.fun, 6)
    baseline = classical_max_cut()

    return {
        "status": "success",
        "algorithm": "QAOA",
        "problem": "Max-Cut",
        "qubits": N,
        "best_bitstring": top,
        "cut_value": observed_cut,
        "expected_cut": expected_cut,
        "parameters": [round(float(x), 6) for x in best.x],
        "classical_baseline": baseline,
        "sample_gap_to_classical": baseline["cut_value"] - observed_cut,
        "expected_gap_to_classical": round(
            baseline["cut_value"] - expected_cut, 6
        ),
    }


if __name__ == "__main__":
    print(run_qaoa())
