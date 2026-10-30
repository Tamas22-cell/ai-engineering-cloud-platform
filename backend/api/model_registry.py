from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from math import isfinite
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from core.rbac import require_role
from models.model_registry import RegisteredModel
from models.model_run import ModelRun
from mlops.metrics import summarize_metrics

router = APIRouter(prefix="/mlops/models", tags=["MLOps"])


class ModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    version: str = Field(min_length=1, max_length=80)
    framework: str = Field(min_length=1, max_length=60)


class StageUpdate(BaseModel):
    stage: str = Field(pattern="^(development|staging|production|archived)$")


class ModelRead(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    name: str
    version: str
    framework: str
    stage: str


@router.get("", response_model=list[ModelRead])
async def list_models(
    limit: int = Query(50, ge=1, le=100),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RegisteredModel).order_by(RegisteredModel.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.post("", response_model=ModelRead, status_code=status.HTTP_201_CREATED)
async def create_model(
    data: ModelCreate,
    user=Depends(require_role("admin", "developer")),
    db: AsyncSession = Depends(get_db),
):
    model = RegisteredModel(**data.model_dump(), created_by=str(user.id))
    db.add(model)
    try:
        await db.commit()
        await db.refresh(model)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Model version already registered")
    return model


@router.patch("/{model_id}/stage", response_model=ModelRead)
async def update_stage(
    model_id: str,
    data: StageUpdate,
    user=Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    model = await db.get(RegisteredModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    model.stage = data.stage
    await db.commit()
    await db.refresh(model)
    return model


class RunCreate(BaseModel):
    metric_name: str = Field(min_length=1, max_length=80)
    metric_value: float
    duration_ms: int = Field(default=0, ge=0)


class RunRead(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    model_id: str
    metric_name: str
    metric_value: float
    duration_ms: int


@router.post("/{model_id}/runs", response_model=RunRead, status_code=201)
async def record_run(
    model_id: str,
    data: RunCreate,
    user=Depends(require_role("admin", "developer")),
    db: AsyncSession = Depends(get_db),
):
    if not isfinite(data.metric_value):
        raise HTTPException(status_code=422, detail="Metric must be finite")
    model = await db.get(RegisteredModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    run = ModelRun(model_id=model_id, created_by=str(user.id), **data.model_dump())
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


@router.get("/{model_id}/runs", response_model=list[RunRead])
async def list_runs(
    model_id: str,
    limit: int = Query(50, ge=1, le=100),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if await db.get(RegisteredModel, model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")
    rows = await db.execute(
        select(ModelRun).where(ModelRun.model_id == model_id)
        .order_by(ModelRun.created_at.desc()).limit(limit)
    )
    return list(rows.scalars().all())


@router.get("/{model_id}/metrics/{metric_name}/summary")
async def metric_summary(
    model_id: str,
    metric_name: str,
    threshold: float | None = Query(default=None),
    direction: str = Query(default="below", pattern="^(below|above)$"),
    limit: int = Query(default=50, ge=1, le=500),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if await db.get(RegisteredModel, model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")
    rows = await db.execute(
        select(ModelRun.metric_value)
        .where(ModelRun.model_id == model_id, ModelRun.metric_name == metric_name)
        .order_by(ModelRun.created_at.desc(), ModelRun.id.desc())
        .limit(limit)
    )
    values = list(reversed(rows.scalars().all()))
    if not values:
        raise HTTPException(status_code=404, detail="No metrics recorded")
    try:
        return {"model_id": model_id, "metric_name": metric_name,
                **summarize_metrics(values, threshold=threshold, direction=direction)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
