import pytest
from pydantic import ValidationError
from api.model_registry import RunCreate, RunRead


def test_model_run_valid():
    run = RunCreate(metric_name="accuracy", metric_value=0.95, duration_ms=125)
    assert run.metric_value == 0.95


def test_negative_duration_rejected():
    with pytest.raises(ValidationError):
        RunCreate(metric_name="accuracy", metric_value=0.9, duration_ms=-1)


def test_empty_metric_rejected():
    with pytest.raises(ValidationError):
        RunCreate(metric_name="", metric_value=0.9)


def test_run_response_schema():
    run = RunRead(id="r1", model_id="m1", metric_name="f1", metric_value=0.8, duration_ms=20)
    assert run.model_id == "m1"
