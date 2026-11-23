from pathlib import Path

source = Path("run_vqe_hardware.py").read_text(encoding="utf-8-sig")
exec(source.split("from agents.vqe_agent import")[0])

from agents.vqe_agent import ansatz, run_vqe, H
from qiskit.transpiler import generate_preset_pass_manager
from qiskit_ibm_runtime import EstimatorV2

result = run_vqe()
backend = service.least_busy(
    operational=True,
    simulator=False
)

qc = ansatz(result["parameters"])
pm = generate_preset_pass_manager(
    backend=backend,
    optimization_level=1
)
isa = pm.run(qc)
observable = H.apply_layout(isa.layout)

estimator = EstimatorV2(mode=backend)
estimator.options.default_shots = 1024

job = estimator.run([(isa, observable)])

print("QPU:", backend.name)
print("VQE ENERGY JOB ID:", job.job_id())
print("STATUS:", job.status())
print("SIMULATED ENERGY:", result["ground_state_energy"])
