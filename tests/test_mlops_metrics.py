import pytest

from mlops.metrics import summarize_metrics


def test_metric_trend_and_mean():
    result = summarize_metrics([0.7, 0.8, 0.9])
    assert result["count"] == 3
    assert result["latest"] == 0.9
    assert result["average"] == pytest.approx(0.8)
    assert result["delta"] == pytest.approx(0.2)
    assert result["alert"] is False


def test_below_threshold_alert():
    assert summarize_metrics([0.8, 0.6], threshold=0.7)["alert"] is True


def test_above_threshold_alert():
    assert summarize_metrics([100.0, 180.0], threshold=150.0, direction="above")["alert"] is True


def test_threshold_equal_is_not_an_alert():
    assert summarize_metrics([0.7], threshold=0.7)["alert"] is False


@pytest.mark.parametrize("values", [[], [float("nan")], [float("inf")]])
def test_reject_invalid_metric_values(values):
    with pytest.raises(ValueError):
        summarize_metrics(values)


def test_reject_invalid_threshold():
    with pytest.raises(ValueError):
        summarize_metrics([0.5], threshold=float("nan"))


def test_reject_invalid_direction():
    with pytest.raises(ValueError):
        summarize_metrics([0.5], direction="other")
