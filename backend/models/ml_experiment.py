"""Experiment tracking tables; legacy model_runs remains untouched."""
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class MLExperiment(Base):
    __tablename__ = "ml_experiments"
    __table_args__ = (UniqueConstraint("model_id", "name", name="uq_ml_experiment_model_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    model_id: Mapped[str] = mapped_column(String(36), ForeignKey("registered_models.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class MLExperimentRun(Base):
    __tablename__ = "ml_experiment_runs"
    __table_args__ = (CheckConstraint("status IN ('pending', 'running', 'completed', 'failed', 'cancelled')", name="ck_ml_experiment_run_status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    experiment_id: Mapped[str] = mapped_column(String(36), ForeignKey("ml_experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    hyperparameters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    dataset_version: Mapped[str | None] = mapped_column(String(160), nullable=True)
    git_commit_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class MLExperimentMetric(Base):
    __tablename__ = "ml_experiment_metrics"
    __table_args__ = (CheckConstraint("step >= 0", name="ck_ml_experiment_metric_step"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("ml_experiment_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
