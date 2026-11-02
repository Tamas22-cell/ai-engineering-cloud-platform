"""Experiment tracking request validation and route contract tests."""
import pytest
from pydantic import ValidationError

from api.experiments import MetricCreate, RunCreate, RunStatusUpdate, valid_id, router
from fastapi import HTTPException


def test_metric_rejects_nonfinite():
    for value in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(ValidationError):
            MetricCreate(name="loss", value=value)


def test_metric_rejects_negative_step():
    with pytest.raises(ValidationError):
        MetricCreate(name="loss", value=0.5, step=-1)


def test_run_metadata_accepts_hyperparameters():
    data = RunCreate(hyperparameters={"learning_rate": 0.001, "epochs": 10}, dataset_version="v1", git_commit_sha="a" * 40)
    assert data.hyperparameters["epochs"] == 10


def test_run_rejects_bad_commit_sha():
    with pytest.raises(ValidationError):
        RunCreate(git_commit_sha="not-a-sha")


def test_run_rejects_bad_status():
    with pytest.raises(ValidationError):
        RunStatusUpdate(status="unknown")


def test_uuid_validation():
    with pytest.raises(HTTPException) as error:
        valid_id("not-an-id")
    assert error.value.status_code == 422


def test_experiment_routes_registered():
    paths = {(route.path, next(iter(route.methods))) for route in router.routes if getattr(route, "methods", None)}
    assert ("/mlops/experiments", "GET") in paths
    assert ("/mlops/experiments/runs/{run_id}/metrics", "GET") in paths
