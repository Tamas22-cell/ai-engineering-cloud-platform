"""Optional Langfuse OTLP export; never export prompts, JWTs or document text."""
import base64
import os
from urllib.parse import urlparse

import structlog
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = structlog.get_logger()


def create_langfuse_exporter():
    """Create an OTLP exporter from validated environment settings, if configured."""
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    if not public_key or not secret_key:
        return None

    host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com").rstrip("/")
    parsed = urlparse(host)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("LANGFUSE_HOST must be an HTTPS base URL without credentials")

    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

    credentials = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    return OTLPSpanExporter(
        endpoint=f"{host}/api/public/otel/v1/traces",
        headers={"Authorization": f"Basic {credentials}"},
        timeout=5,
    )


def configure_langfuse():
    exporter = create_langfuse_exporter()
    if exporter is None:
        logger.info("langfuse_export_disabled")
        return None

    provider = TracerProvider(resource=Resource.create({"service.name": "ai-engineering-api"}))
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    logger.info("langfuse_export_configured")
    return provider
