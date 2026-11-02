"""MLOps experiment tracking API. Independent from legacy model run routes."""
from datetime import datetime, timezone
from math import isfinite
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.rbac import require_role
from models.ml_experiment import MLExperiment, MLExperimentRun, MLExperimentMetric
from models.model_registry import RegisteredModel

router = APIRouter(prefix="/mlops/experiments", tags=["MLOps Experiments"])


class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    model_id: str


class RunCreate(BaseModel):
    hyperparameters: dict = Field(default_factory=dict)
    dataset_version: str | None = Field(default=None, max_length=160)
    git_commit_sha: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{40}$")


class RunStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|running|completed|failed|cancelled)$")


class MetricCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    value: float
    step: int = Field(default=0, ge=0)

    @field_validator("value")
    @classmethod
    def finite_value(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("Metric must be finite")
        return value


def valid_id(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")


@router.get("")
async def list_experiments(limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    rows = await db.execute(select(MLExperiment).order_by(MLExperiment.created_at.desc()).limit(limit))
    return [{"id": e.id, "name": e.name, "model_id": e.model_id, "created_at": e.created_at} for e in rows.scalars()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_experiment(data: ExperimentCreate, user=Depends(require_role("admin", "developer")), db: AsyncSession = Depends(get_db)):
    if await db.get(RegisteredModel, valid_id(data.model_id)) is None:
        raise HTTPException(status_code=404, detail="Model not found")
    item = MLExperiment(name=data.name, model_id=data.model_id, created_by=str(user.id))
    db.add(item)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Experiment already exists for this model")
    await db.refresh(item)
    return {"id": item.id, "name": item.name, "model_id": item.model_id}


@router.get("/{experiment_id}/runs")
async def list_runs(experiment_id: str, limit: int = Query(50, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    eid = valid_id(experiment_id)
    if await db.get(MLExperiment, eid) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    rows = await db.execute(select(MLExperimentRun).where(MLExperimentRun.experiment_id == eid).order_by(MLExperimentRun.created_at.desc()).limit(limit))
    return [{"id": r.id, "experiment_id": r.experiment_id, "status": r.status, "hyperparameters": r.hyperparameters, "dataset_version": r.dataset_version, "git_commit_sha": r.git_commit_sha} for r in rows.scalars()]


@router.post("/{experiment_id}/runs", status_code=201)
async def create_run(experiment_id: str, data: RunCreate, user=Depends(require_role("admin", "developer")), db: AsyncSession = Depends(get_db)):
    eid = valid_id(experiment_id)
    if await db.get(MLExperiment, eid) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    item = MLExperimentRun(experiment_id=eid, created_by=str(user.id), **data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "experiment_id": item.experiment_id, "status": item.status}


@router.patch("/runs/{run_id}/status")
async def update_run_status(run_id: str, data: RunStatusUpdate, user=Depends(require_role("admin", "developer")), db: AsyncSession = Depends(get_db)):
    item = await db.get(MLExperimentRun, valid_id(run_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if item.status in ("completed", "failed", "cancelled") and item.status != data.status:
        raise HTTPException(status_code=409, detail="Terminal run cannot change status")
    if data.status == "running" and item.started_at is None:
        item.started_at = datetime.now(timezone.utc)
    if data.status in ("completed", "failed", "cancelled") and item.finished_at is None:
        item.finished_at = datetime.now(timezone.utc)
    item.status = data.status
    await db.commit()
    return {"id": item.id, "status": item.status}


@router.get("/runs/{run_id}/metrics")
async def list_metrics(run_id: str, limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    rid = valid_id(run_id)
    if await db.get(MLExperimentRun, rid) is None:
        raise HTTPException(status_code=404, detail="Run not found")
    rows = await db.execute(select(MLExperimentMetric).where(MLExperimentMetric.run_id == rid).order_by(MLExperimentMetric.recorded_at.asc(), MLExperimentMetric.id.asc()).limit(limit))
    return [{"id": m.id, "name": m.name, "value": m.value, "step": m.step} for m in rows.scalars()]


@router.post("/runs/{run_id}/metrics", status_code=201)
async def record_metric(run_id: str, data: MetricCreate, user=Depends(require_role("admin", "developer")), db: AsyncSession = Depends(get_db)):
    rid = valid_id(run_id)
    run = await db.get(MLExperimentRun, rid)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=409, detail="Cannot record metrics for terminal run")
    metric = MLExperimentMetric(run_id=rid, **data.model_dump())
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    return {"id": metric.id, "run_id": rid, "name": metric.name, "value": metric.value, "step": metric.step}
