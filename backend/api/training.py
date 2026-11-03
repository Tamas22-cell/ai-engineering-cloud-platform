"""Bounded, reproducible synthetic regression training for MLOps experiments."""
from datetime import datetime, timezone
import os
import re
import hashlib
import hmac
import json
from time import perf_counter
from uuid import UUID

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.rbac import require_role
from models.ml_experiment import MLExperiment, MLExperimentRun, MLExperimentMetric

router = APIRouter(prefix="/mlops/training", tags=["MLOps Training"])


class TrainingRequest(BaseModel):
    samples: int = Field(default=200, ge=50, le=2000)
    noise: float = Field(default=0.15, ge=0, le=2)
    seed: int = Field(default=42, ge=0, le=2_147_483_647)
    learning_rate: float = Field(default=0.05, gt=0, le=0.2)
    epochs: int = Field(default=200, ge=10, le=1000)


@router.post("/experiments/{experiment_id}/run", status_code=201)
async def train_regression(
    experiment_id: str,
    config: TrainingRequest,
    user=Depends(require_role("admin", "developer")),
    db: AsyncSession = Depends(get_db),
):
    try:
        experiment_id = str(UUID(experiment_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid experiment ID")
    experiment = await db.get(MLExperiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    revision = os.getenv('RENDER_GIT_COMMIT', '')
    revision = revision if re.fullmatch(r'[a-fA-F0-9]{40}', revision) else None
    started = perf_counter()
    run = MLExperimentRun(
        experiment_id=experiment_id,
        created_by=str(user.id),
        status="running",
        git_commit_sha=revision,
        started_at=datetime.now(timezone.utc),
        dataset_version=f"synthetic-linear-v1-seed-{config.seed}",
        hyperparameters={**config.model_dump(), "algorithm": "numpy_gradient_descent", "dataset": "synthetic"},
    )
    db.add(run)
    await db.flush()
    try:
        rng = np.random.default_rng(config.seed)
        x = rng.normal(size=config.samples)
        y = 2.5 * x + 0.7 + rng.normal(scale=config.noise, size=config.samples)
        indices = rng.permutation(config.samples)
        cutoff = int(config.samples * 0.8)
        train, test = indices[:cutoff], indices[cutoff:]
        # Standardized inputs keep bounded gradient descent stable.
        mean, std = float(x[train].mean()), float(x[train].std())
        if std < 1e-12:
            raise ValueError("Degenerate training data")
        xt = (x[train] - mean) / std
        xv = (x[test] - mean) / std
        weight, bias = 0.0, 0.0
        for _ in range(config.epochs):
            error = weight * xt + bias - y[train]
            weight -= config.learning_rate * float(2 * np.mean(error * xt))
            bias -= config.learning_rate * float(2 * np.mean(error))
        prediction = weight * xv + bias
        residual = y[test] - prediction
        mae = float(np.mean(np.abs(residual)))
        rmse = float(np.sqrt(np.mean(residual ** 2)))
        denominator = float(np.sum((y[test] - np.mean(y[test])) ** 2))
        r2 = float(1 - np.sum(residual ** 2) / denominator) if denominator > 0 else 0.0
        # Portable model artifact persisted in PostgreSQL JSONB (not ephemeral disk).
        artifact = {
            "schema_version": 1,
            "algorithm": "numpy_gradient_descent",
            "features": ["x"],
            "target": "y",
            "parameters": {
                "weight": float(weight), "bias": float(bias),
                "input_mean": mean, "input_std": std,
            },
        }
        canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False)
        run.hyperparameters = {
            **run.hyperparameters,
            "model_artifact": artifact,
            "artifact_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        }
        for name, value in (("mae", mae), ("rmse", rmse), ("r2", r2)):
            db.add(MLExperimentMetric(run_id=run.id, name=name, value=value, step=config.epochs))
        run.status = "completed"
        run.finished_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {
        "run_id": run.id, "experiment_id": experiment_id, "status": run.status,
        "dataset": "synthetic", "train_samples": cutoff,
        "test_samples": config.samples - cutoff,
        "metrics": {"mae": mae, "rmse": rmse, "r2": r2},
        "duration_ms": round((perf_counter() - started) * 1000, 2),
    }


@router.get("/runs/{run_id}/artifact")
async def get_training_artifact(
    run_id: str,
    user=Depends(require_role("admin", "developer")),
    db: AsyncSession = Depends(get_db),
):
    try:
        run_id = str(UUID(run_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid run ID")
    run = await db.get(MLExperimentRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != "completed":
        raise HTTPException(status_code=409, detail="Training run is not completed")
    params = run.hyperparameters or {}
    artifact = params.get("model_artifact")
    digest = params.get("artifact_sha256")
    if not isinstance(artifact, dict) or not isinstance(digest, str):
        raise HTTPException(status_code=404, detail="No stored artifact for this run")
    canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False)
    actual = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(actual, digest):
        raise HTTPException(status_code=409, detail="Artifact integrity check failed")
    return {"run_id": run.id, "git_commit_sha": run.git_commit_sha,
            "dataset_version": run.dataset_version, "artifact": artifact,
            "sha256": digest}
