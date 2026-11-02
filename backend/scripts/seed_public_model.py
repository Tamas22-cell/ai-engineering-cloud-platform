"""Idempotent, real deterministic regression baseline for the public MLOps registry."""
import asyncio
from time import perf_counter

import numpy as np
from sqlalchemy import select

from core.database import AsyncSessionLocal
from models.model_registry import RegisteredModel
from models.model_run import ModelRun
from models.user import User

MODEL_NAME = "Synthetic Regression Baseline"
MODEL_VERSION = "1.0.0"


async def seed_public_model() -> None:
    async with AsyncSessionLocal() as db:
        # The existing schema requires a real user FK. Never create a fake login.
        owner = (await db.execute(select(User).where(User.is_active.is_(True)).order_by(User.created_at).limit(1))).scalar_one_or_none()
        if owner is None:
            print("MLOps seed skipped: no active user exists; no synthetic account created")
            return

        existing = (await db.execute(select(RegisteredModel).where(
            RegisteredModel.name == MODEL_NAME, RegisteredModel.version == MODEL_VERSION
        ))).scalar_one_or_none()

        # Fixed synthetic dataset: these are actual computed metrics, not production telemetry.
        rng = np.random.default_rng(42)
        x = np.linspace(-2, 2, 120)
        y = 2.5 * x - 0.7 + rng.normal(0, 0.2, size=x.size)
        train_x, test_x = x[:90], x[90:]
        train_y, test_y = y[:90], y[90:]
        start = perf_counter()
        slope, intercept = np.polyfit(train_x, train_y, 1)
        predictions = slope * test_x + intercept
        duration_ms = max(0, round((perf_counter() - start) * 1000))
        mae = float(np.mean(np.abs(test_y - predictions)))
        rmse = float(np.sqrt(np.mean((test_y - predictions) ** 2)))

        model = existing
        if model is None:
            model = RegisteredModel(name=MODEL_NAME, version=MODEL_VERSION, framework="NumPy", created_by=owner.id)
            db.add(model)
            await db.flush()

        # Twelve independently evaluated, reproducible synthetic batches.
        # Only add missing batches on subsequent deploys.
        existing_mae = (await db.execute(
            select(ModelRun).where(ModelRun.model_id == model.id, ModelRun.metric_name == "mae")
        )).scalars().all()
        existing_rmse = (await db.execute(
            select(ModelRun).where(ModelRun.model_id == model.id, ModelRun.metric_name == "rmse")
        )).scalars().all()
        new_runs = []
        for batch in range(max(len(existing_mae), len(existing_rmse)), 12):
            batch_rng = np.random.default_rng(1000 + batch)
            batch_x = np.linspace(-2, 2, 30)
            batch_y = 2.5 * batch_x - 0.7 + batch_rng.normal(0, 0.2, size=batch_x.size)
            residual = batch_y - (slope * batch_x + intercept)
            new_runs.extend([
                ModelRun(model_id=model.id, created_by=owner.id, metric_name="mae",
                         metric_value=float(np.mean(np.abs(residual))), duration_ms=duration_ms),
                ModelRun(model_id=model.id, created_by=owner.id, metric_name="rmse",
                         metric_value=float(np.sqrt(np.mean(residual ** 2))), duration_ms=duration_ms),
            ])
        if new_runs:
            db.add_all(new_runs)
            await db.commit()
        print(f"MLOps baseline: {len(new_runs)//2} new synthetic batches evaluated")


if __name__ == "__main__":
    asyncio.run(seed_public_model())
