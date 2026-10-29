from api.agents import router as agents_router
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.health import router as health_router
from core.config import settings

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "application_startup",
        environment=settings.environment,
    )
    yield
    logger.info("application_shutdown")


app = FastAPI(
    title="AI Engineering Cloud Platform",
    version="0.1.0",
    description="Phase 1: Auth, Database, Health, Dashboard Backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "message": "AI Engineering Cloud Platform API",
        "status": "Phase 1",
    }
from api.auth import router as auth_router
app.include_router(auth_router)

from api.admin import router as admin_router
app.include_router(admin_router)

app.include_router(agents_router)
