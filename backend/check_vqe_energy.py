from pathlib import Path

source = Path("run_quantum_hardware.py").read_text(encoding="utf-8-sig")
setup = source.split("backend = service.least_busy")[0]
exec(setup)

job = service.job("dc248odhdvas73bljko0")
status = job.status()

print("STATUS:", status)

if job.done():
    result = job.result()[0]
    print("HARDWARE ENERGY:", float(result.data.evs))
    print("STANDARD ERROR:", float(result.data.stds))
    print("SIMULATED ENERGY:", -1.414214)
    print("ABSOLUTE DIFFERENCE:", abs(float(result.data.evs) + 1.414214))
else:
    print("A kvantumfeladat még nem fejeződött be.")
