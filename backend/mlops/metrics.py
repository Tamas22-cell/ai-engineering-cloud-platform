"""Pure MLOps metrics summary and threshold evaluation helpers."""
from math import isfinite
from statistics import mean


def summarize_metrics(values: list[float], threshold: float | None = None, direction: str = "below") -> dict:
    if not values or any(not isfinite(v) for v in values):
        raise ValueError("At least one finite metric is required")
    if direction not in ("below", "above"):
        raise ValueError("Invalid threshold direction")
    if threshold is not None and not isfinite(threshold):
        raise ValueError("Threshold must be finite")
    latest = values[-1]
    alert = threshold is not None and (
        (direction == "below" and latest < threshold)
        or (direction == "above" and latest > threshold)
    )
    return {
        "count": len(values),
        "latest": latest,
        "average": mean(values),
        "minimum": min(values),
        "maximum": max(values),
        "delta": latest - values[0],
        "threshold": threshold,
        "direction": direction,
        "alert": alert,
    }
