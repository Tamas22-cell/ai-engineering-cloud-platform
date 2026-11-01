"""MLOps metric alert boundary and malformed-input tests."""
import math

import pytest

from mlops.metrics import summarize_metrics


def test_below_threshold_alert():
    result = summarize_metrics([0.94, 0.87, 0.79], threshold=0.80)
    assert result["alert"] is True
    assert result["latest"] == 0.79
    assert result["delta"] == pytest.approx(-0.15)


def test_above_threshold_alert():
    assert summarize_metrics([0.12, 0.30], threshold=0.25, direction="above")["alert"] is True


@pytest.mark.parametrize("direction,values,threshold", [
    ("below", [0.8], 0.8),
    ("above", [0.8], 0.8),
])
def test_equal_threshold_does_not_alert(direction, values, threshold):
    assert summarize_metrics(values, threshold=threshold, direction=direction)["alert"] is False


@pytest.mark.parametrize("values", [[], [float("nan")], [float("inf")], [float("-inf")]])
def test_invalid_metrics_rejected(values):
    with pytest.raises(ValueError):
        summarize_metrics(values)


@pytest.mark.parametrize("threshold", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_threshold_rejected(threshold):
    with pytest.raises(ValueError):
        summarize_metrics([0.8], threshold=threshold)


def test_summary_statistics():
    result = summarize_metrics([0.2, 0.4, 0.6])
    assert result["count"] == 3
    assert result["average"] == pytest.approx(0.4)
    assert result["minimum"] == 0.2
    assert result["maximum"] == 0.6
    assert result["alert"] is False
