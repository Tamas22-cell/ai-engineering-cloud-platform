"""MLOps model registry input validation regression tests."""
import math

import pytest
from pydantic import ValidationError

from api.model_registry import ModelCreate, RunCreate, StageUpdate


@pytest.mark.parametrize("field", ["name", "version", "framework"])
def test_model_fields_reject_blank(field):
    values = {"name": "classifier", "version": "v1", "framework": "pytorch"}
    values[field] = ""
    with pytest.raises(ValidationError):
        ModelCreate(**values)


@pytest.mark.parametrize("stage", ["development", "staging", "production", "archived"])
def test_supported_model_stages(stage):
    assert StageUpdate(stage=stage).stage == stage


@pytest.mark.parametrize("duration", [-1, -100])
def test_run_rejects_negative_duration(duration):
    with pytest.raises(ValidationError):
        RunCreate(metric_name="accuracy", metric_value=0.9, duration_ms=duration)


def test_run_accepts_valid_metric():
    run = RunCreate(metric_name="accuracy", metric_value=0.9, duration_ms=125)
    assert math.isclose(run.metric_value, 0.9)
    assert run.duration_ms == 125
