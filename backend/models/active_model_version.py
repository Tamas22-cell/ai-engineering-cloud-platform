"""Durable active artifact pointer, scoped to an experiment."""
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base

class ActiveModelVersion(Base):
    __tablename__ = "ml_active_model_versions"
    experiment_id: Mapped[str] = mapped_column(String(36), ForeignKey("ml_experiments.id", ondelete="CASCADE"), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("ml_experiment_runs.id", ondelete="RESTRICT"), nullable=False)
    activated_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
