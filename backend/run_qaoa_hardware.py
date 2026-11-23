from pathlib import Path

source = Path("run_quantum_hardware.py").read_text(encoding="utf-8-sig")
setup = source.split("backend = service.least_busy")[0]
exec(setup)

from agents.qaoa_agent import build_qaoa, run_qaoa
from qiskit.transpiler import generate_preset_pass_manager
from qiskit_ibm_runtime import SamplerV2

params = run_qaoa()["parameters"]

backend = service.least_busy(
    operational=True,
    simulator=False
)

qc = build_qaoa(*params)
qc.measure_all()

pm = generate_preset_pass_manager(
    backend=backend,
    optimization_level=1
)
isa = pm.run(qc)

sampler = SamplerV2(mode=backend)
job = sampler.run([isa], shots=256)

print("QPU:", backend.name)
print("QAOA JOB ID:", job.job_id())
print("STATUS:", job.status())
