import time
from collections import deque
from threading import Lock

_runs = deque(maxlen=1000)
_lock = Lock()


def record_run(duration_ms, tools_used, success):
    entry = {
        "timestamp": time.time(),
        "duration_ms": round(duration_ms, 2),
        "tools_used": list(tools_used),
        "success": bool(success),
    }
    with _lock:
        _runs.append(entry)


def get_metrics():
    with _lock:
        runs = list(_runs)

    total = len(runs)
    successful = sum(r["success"] for r in runs)

    return {
        "total_runs": total,
        "successful_runs": successful,
        "failed_runs": total - successful,
        "success_rate": round(successful / total * 100, 2) if total else 0,
        "average_duration_ms": round(
            sum(r["duration_ms"] for r in runs) / total, 2
        ) if total else 0,
        "recent_runs": runs[-20:],
    }
