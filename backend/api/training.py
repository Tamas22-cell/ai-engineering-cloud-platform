"""Bounded, reproducible synthetic regression training for MLOps experiments."""
from datetime import datetime, timezone
import os
import re
import hashlib
import hmac
import json
import math
from time import perf_counter
from uuid import UUID

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.rbac import require_role
from models.ml_experiment import MLExperiment, MLExperimentRun, MLExperimentMetric
from models.active_model_version import ActiveModelVersion
from models.audit_log import AuditLog

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


@router.get("/experiments/{experiment_id}/artifact-versions")
async def list_artifact_versions(
    experiment_id: str,
    user=Depends(require_role("admin", "developer")),
    db: AsyncSession = Depends(get_db),
):
    """Read-only catalog of immutable training run artifacts; no active version changes."""
    try:
        experiment_id = str(UUID(experiment_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid experiment ID")
    if await db.get(MLExperiment, experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    result = await db.execute(
        select(MLExperimentRun)
        .where(MLExperimentRun.experiment_id == experiment_id, MLExperimentRun.status == "completed")
        .order_by(MLExperimentRun.created_at.desc(), MLExperimentRun.id.desc())
        .limit(100)
    )
    versions = []
    for run in result.scalars():
        data = run.hyperparameters or {}
        artifact, digest = data.get("model_artifact"), data.get("artifact_sha256")
        if not isinstance(artifact, dict) or not isinstance(digest, str):
            continue
        try:
            canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False)
            valid = hmac.compare_digest(hashlib.sha256(canonical.encode("utf-8")).hexdigest(), digest)
        except (TypeError, ValueError):
            valid = False
        versions.append({
            "version_id": run.id,
            "run_id": run.id,
            "artifact_sha256": digest,
            "integrity_ok": valid,
            "schema_version": artifact.get("schema_version"),
            "dataset_version": run.dataset_version,
            "git_commit_sha": run.git_commit_sha,
            "created_at": run.created_at,
            "active": False,
        })
    return {"experiment_id": experiment_id, "versions": versions,
            "active_version_id": None, "rollback_supported": False}



@router.get("/experiments/{experiment_id}/rollback-preview/{target_run_id}")
async def rollback_preview(
    experiment_id: str,
    target_run_id: str,
    user=Depends(require_role("admin", "developer")),
    db: AsyncSession = Depends(get_db),
):
    """Read-only integrity and ownership preflight; never switches active models."""
    try:
        eid, rid = str(UUID(experiment_id)), str(UUID(target_run_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")
    if await db.get(MLExperiment, eid) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    run = await db.get(MLExperimentRun, rid)
    if run is None or run.experiment_id != eid:
        raise HTTPException(status_code=404, detail="Run not found in experiment")
    params = run.hyperparameters or {}
    artifact, digest = params.get("model_artifact"), params.get("artifact_sha256")
    checks = {
        "completed": run.status == "completed",
        "artifact_present": isinstance(artifact, dict) and isinstance(digest, str),
        "supported_schema": isinstance(artifact, dict) and artifact.get("schema_version") == 1 and artifact.get("algorithm") == "numpy_gradient_descent",
        "integrity_ok": False,
    }
    if checks["artifact_present"]:
        try:
            canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False)
            checks["integrity_ok"] = hmac.compare_digest(hashlib.sha256(canonical.encode("utf-8")).hexdigest(), digest)
        except (ValueError, TypeError):
            pass
    return {"experiment_id": eid, "target_run_id": rid, "checks": checks,
            "eligible_for_activation_review": all(checks.values()),
            "active_version_changed": False, "artifact_deployed": False}

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


class InferenceRequest(BaseModel):
    values: list[float] = Field(min_length=1, max_length=1000)


@router.post("/runs/{run_id}/predict")
async def predict_from_training_run(
    run_id: str,
    request: InferenceRequest,
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
    stored = run.hyperparameters or {}
    artifact, digest = stored.get("model_artifact"), stored.get("artifact_sha256")
    if not isinstance(artifact, dict) or not isinstance(digest, str):
        raise HTTPException(status_code=404, detail="Model artifact not available")
    try:
        canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False)
        actual = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(actual, digest):
            raise HTTPException(status_code=409, detail="Artifact integrity check failed")
        if artifact.get("schema_version") != 1 or artifact.get("algorithm") != "numpy_gradient_descent":
            raise HTTPException(status_code=422, detail="Unsupported model artifact")
        p = artifact["parameters"]
        weight, bias = float(p["weight"]), float(p["bias"])
        mean, std = float(p["input_mean"]), float(p["input_std"])
        if not all(math.isfinite(v) for v in (weight, bias, mean, std)) or std <= 0:
            raise ValueError("Invalid model parameters")
        if not all(math.isfinite(v) for v in request.values):
            raise ValueError("Non-finite input")
        predictions = [weight * ((v - mean) / std) + bias for v in request.values]
        if not all(math.isfinite(v) for v in predictions):
            raise ValueError("Non-finite prediction")
    except (KeyError, TypeError, ValueError, OverflowError):
        raise HTTPException(status_code=422, detail="Invalid model artifact or input")
    return {"run_id": run.id, "artifact_sha256": digest,
            "predictions": predictions, "count": len(predictions)}


@router.get("/experiments/{experiment_id}/active-version")
async def get_active_version(
    experiment_id: str,
    user=Depends(require_role("admin", "developer")),
    db: AsyncSession = Depends(get_db),
):
    try:
        eid = str(UUID(experiment_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid experiment ID")
    if await db.get(MLExperiment, eid) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    pointer = await db.get(ActiveModelVersion, eid)
    return {"experiment_id": eid, "active_run_id": pointer.run_id if pointer else None,
            "activated_at": pointer.activated_at if pointer else None}


@router.post("/experiments/{experiment_id}/active-version/{run_id}")
async def activate_model_version(
    experiment_id: str,
    run_id: str,
    user=Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only atomic pointer switch; does not deploy an artifact."""
    try:
        eid, rid = str(UUID(experiment_id)), str(UUID(run_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid ID")
    # Lock experiment to serialize competing activation requests, including initial activation.
    experiment = (await db.execute(
        select(MLExperiment).where(MLExperiment.id == eid).with_for_update()
    )).scalar_one_or_none()
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    run = await db.get(MLExperimentRun, rid)
    if run is None or run.experiment_id != eid:
        raise HTTPException(status_code=404, detail="Run not found in experiment")
    params = run.hyperparameters or {}
    artifact, digest = params.get("model_artifact"), params.get("artifact_sha256")
    if run.status != "completed" or not isinstance(artifact, dict) or not isinstance(digest, str):
        raise HTTPException(status_code=409, detail="Run has no completed model artifact")
    try:
        canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False)
        valid = hmac.compare_digest(hashlib.sha256(canonical.encode("utf-8")).hexdigest(), digest)
    except (TypeError, ValueError):
        valid = False
    if not valid or artifact.get("schema_version") != 1 or artifact.get("algorithm") != "numpy_gradient_descent":
        raise HTTPException(status_code=409, detail="Unsupported or corrupted model artifact")
    pointer = await db.get(ActiveModelVersion, eid)
    previous_run_id = pointer.run_id if pointer else None
    if pointer is None:
        pointer = ActiveModelVersion(experiment_id=eid, run_id=rid, activated_by=str(user.id))
        db.add(pointer)
    else:
        pointer.run_id = rid
        pointer.activated_by = str(user.id)
        pointer.activated_at = datetime.now(timezone.utc)
    db.add(AuditLog(event_type="mlops_active_version_changed", user_id=str(user.id)))
    await db.commit()
    return {"experiment_id": eid, "previous_run_id": previous_run_id,
            "active_run_id": rid, "artifact_deployed": False}
