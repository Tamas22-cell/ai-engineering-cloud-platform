from api.rag import router as rag_router
from api.agents import router as agents_router
from api.finops import fetch_vercel_billing, router as finops_router
from contextlib import asynccontextmanager, suppress
import asyncio
import os

import structlog
from time import perf_counter
from uuid import uuid4

from fastapi import HTTPException, Request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.health import router as health_router
from core.config import settings
from core.langfuse_tracing import configure_langfuse
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

logger = structlog.get_logger()


async def log_vercel_billing_readiness():
    try:
        result = await fetch_vercel_billing()
    except HTTPException as exc:
        code = exc.detail.get("code") if isinstance(exc.detail, dict) else "not_configured"
        logger.warning("vercel_billing_probe", outcome=code)
    except Exception as exc:
        logger.warning("vercel_billing_probe", outcome="unexpected_error", error_type=type(exc).__name__)
    else:
        outcome = "empty_period" if not result["totals"] else "available"
        logger.info("vercel_billing_probe", outcome=outcome)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Privileged, opt-in, one-account bootstrap for free-tier deployments without Shell.
    # No HTTP endpoint; disabled unless BOTH environment variables are configured.
    bootstrap_email = os.getenv("ONE_TIME_DEVELOPER_EMAIL", "").strip().lower()
    bootstrap_enabled = os.getenv("ONE_TIME_DEVELOPER_CONFIRM", "") == "YES"
    if bootstrap_email and bootstrap_enabled:
        from scripts.grant_developer import grant_developer
        try:
            await grant_developer(bootstrap_email, confirm=True)
            logger.info("developer_bootstrap_completed")
        except Exception:
            # A missing or mismatched account must never take the API offline.
            logger.exception("developer_bootstrap_failed_no_role_change")

    # Separate, explicit, single-account admin bootstrap. This is deliberately
    # not exposed as an HTTP endpoint. Remove both Render variables immediately
    # after the successful deployment/startup that grants the role.
    admin_email = os.getenv("ONE_TIME_ADMIN_EMAIL", "").strip().lower()
    admin_enabled = os.getenv("ONE_TIME_ADMIN_CONFIRM", "") == "YES"
    if admin_email and admin_enabled:
        from scripts.grant_admin import grant_admin
        try:
            await grant_admin(admin_email, confirm=True)
            logger.info("admin_bootstrap_completed")
        except Exception:
            # A missing/mismatched account must never take the API offline.
            logger.exception("admin_bootstrap_failed_no_role_change")

    tracer_provider = configure_langfuse()
    logger.info(
        "application_startup",
        environment=settings.environment,
    )
    billing_probe = None
    if settings.environment == "production" and os.getenv("VERCEL_ACCESS_TOKEN") and os.getenv("VERCEL_TEAM_ID"):
        billing_probe = asyncio.create_task(log_vercel_billing_readiness())
    try:
        yield
    finally:
        if billing_probe is not None:
            billing_probe.cancel()
            with suppress(asyncio.CancelledError):
                await billing_probe
    if tracer_provider is not None:
        tracer_provider.shutdown()
    logger.info("application_shutdown")


app = FastAPI(
    title="AI Engineering Cloud Platform",
    version="0.1.0",
    description="Phase 1: Auth, Database, Health, Dashboard Backend",
    lifespan=lifespan,
)

FastAPIInstrumentor.instrument_app(app, excluded_urls="health/(live|ready|integrations(/langfuse-probe)?)")


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
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
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
app.include_router(finops_router)

from api.rag_upload import router as rag_upload_router
app.include_router(rag_upload_router)

from api.rag_documents import router as rag_documents_router
app.include_router(rag_documents_router)

from api.rag_index import router as rag_index_router
app.include_router(rag_index_router)

from api.model_registry import router as model_registry_router
app.include_router(model_registry_router)

from api.experiments import router as experiments_router
app.include_router(experiments_router)

from api.training import router as training_router
app.include_router(training_router)
