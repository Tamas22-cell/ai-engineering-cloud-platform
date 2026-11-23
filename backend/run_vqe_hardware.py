from pathlib import Path

source = Path("run_qaoa_hardware.py").read_text(encoding="utf-8-sig")
setup = source.split("from agents.qaoa_agent import")[0]
exec(setup)

from agents.vqe_agent import ansatz, run_vqe
from qiskit.transpiler import generate_preset_pass_manager
from qiskit_ibm_runtime import SamplerV2

result = run_vqe()
params = result["parameters"]

backend = service.least_busy(
    operational=True,
    simulator=False
)

qc = ansatz(params)
qc.measure_all()

pm = generate_preset_pass_manager(
    backend=backend,
    optimization_level=1
)
isa = pm.run(qc)

sampler = SamplerV2(mode=backend)
job = sampler.run([isa], shots=256)

print("QPU:", backend.name)
print("VQE JOB ID:", job.job_id())
print("STATUS:", job.status())
