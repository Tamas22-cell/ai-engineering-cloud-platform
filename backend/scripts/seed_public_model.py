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
        if existing is not None:
            print("MLOps seed already present")
            return

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

        model = RegisteredModel(name=MODEL_NAME, version=MODEL_VERSION, framework="NumPy", created_by=owner.id)
        db.add(model)
        await db.flush()
        db.add_all([
            ModelRun(model_id=model.id, created_by=owner.id, metric_name="mae", metric_value=mae, duration_ms=duration_ms),
            ModelRun(model_id=model.id, created_by=owner.id, metric_name="rmse", metric_value=rmse, duration_ms=duration_ms),
        ])
        await db.commit()
        print(f"MLOps baseline registered: MAE={mae:.4f}, RMSE={rmse:.4f} (synthetic test dataset)")


if __name__ == "__main__":
    asyncio.run(seed_public_model())
