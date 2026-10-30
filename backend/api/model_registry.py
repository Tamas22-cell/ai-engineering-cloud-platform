from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from core.rbac import require_role
from models.model_registry import RegisteredModel

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
