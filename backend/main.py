from api.rag import router as rag_router
from api.agents import router as agents_router
from contextlib import asynccontextmanager

import structlog
from time import perf_counter
from uuid import uuid4

from fastapi import Request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.health import router as health_router
from core.config import settings
from core.langfuse_tracing import configure_langfuse

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    tracer_provider = configure_langfuse()
    logger.info(
        "application_startup",
        environment=settings.environment,
    )
    yield
    if tracer_provider is not None:
        tracer_provider.shutdown()
    logger.info("application_shutdown")


app = FastAPI(
    title="AI Engineering Cloud Platform",
    version="0.1.0",
    description="Phase 1: Auth, Database, Health, Dashboard Backend",
    lifespan=lifespan,
)



@app.middleware("http")
async def request_observability(request: Request, call_next):
    """Log request metadata only; never log tokens, prompts or document contents."""
    request_id = str(uuid4())
    start = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "http_request_failed",
            request_id=request_id,
            method=request.method,
            route=request.scope.get("route").path if request.scope.get("route") else "unmatched",
            duration_ms=round((perf_counter() - start) * 1000, 2),
        )
        raise
    logger.info(
        "http_request_completed",
        request_id=request_id,
        method=request.method,
        route=request.scope.get("route").path if request.scope.get("route") else "unmatched",
        status_code=response.status_code,
        duration_ms=round((perf_counter() - start) * 1000, 2),
    )
    response.headers["X-Request-ID"] = request_id
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
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

app.include_router(rag_router)

from api.rag_upload import router as rag_upload_router
app.include_router(rag_upload_router)

from api.rag_documents import router as rag_documents_router
app.include_router(rag_documents_router)

from api.rag_index import router as rag_index_router
app.include_router(rag_index_router)

from api.model_registry import router as model_registry_router
app.include_router(model_registry_router)
