# AI Engineering Cloud Platform

<div align="center">

![AI Engineering Cloud Platform hero](./0440FF6D-F303-423D-9760-1CAFDCF56B8E.png)

### AI Engineering — Cloud · Agents · RAG · MLOps

<table><tr><td width="50%"><img src="./08CD1F7C-C8DA-4DC5-9310-DD9049ECBA9E.png" alt="AI Engineering visual 2" width="100%" /></td><td width="50%"><img src="./5BB3FDCC-EFC3-48E5-B018-D2D925714F45.png" alt="AI Engineering visual 3" width="100%" /></td></tr></table>

</div>

A standalone engineering portfolio project by Tamas Nemeth.

## Current state
- Responsive Next.js frontend on Vercel and FastAPI backend on Render; the live DevOps panel and health endpoints show current availability.
- Private RAG PDF upload, indexing, source-cited answers and measured LangGraph stage timings were verified against a real uploaded document.
- Authenticated Agent and private RAG workflows require sign-in. Hosted LLM and tool-calling modes use server-side provider configuration.
- Blockchain MCP tool discovery and a Bitcoin block lookup were verified; local Ollama, VQE and QAOA runs were also verified.
- Agent monitoring authentication and MLOps role boundaries have automated negative tests. QAOA reports an exact classical baseline for the current three-node Max-Cut graph.
- GitHub Actions runs backend tests, the frontend build, dependency security audits and Compose/Kubernetes manifest checks. [View workflow history](https://github.com/Tamas22-cell/ai-engineering-cloud-platform/actions).
- A synthetic golden-vector fixture tests ranking logic. A separate benchmark generates real query and passage embeddings from the configured provider and reports Recall@k and MRR.
- No fabricated agent counts, uptime, cloud spend, security scores or production telemetry are presented. No Azure billing account or payment card is required for this preview.

## Try the live platform

Open the [AI Engineering Cloud Platform](https://ai-engineering-cloud-platform.vercel.app/).

### Without signing in

- **Data Engineering → CSV Quality Profiler:** Select a UTF-8, comma-separated CSV file up to 5 MB. Analysis runs in your browser; the file is not uploaded to the backend.
- **RAG → Public RAG demo:** Ask about the two built-in sample documents. This is a static demonstration: it does not call OpenAI, query a database, or accept PDF uploads.

### Sign-in required

- Sign in through either **Agents** or **RAG**; the private Agent and RAG modules share the login.
- **Agents:** Use authenticated chat and saved workflow runs. LLM and tool-calling modes require an OpenAI API key configured on the backend.
- **Private RAG:** Upload and index a PDF, then ask questions about your documents and review the returned sources.
- **MLOps:** Activating a model version is admin-only.

### Check the live service

- In **DevOps**, select **Refresh status** to check the backend, database and integrations and view recent GitHub Actions runs. These statuses can change.
- Direct checks: [backend liveness](https://ai-engineering-cloud-platform.vercel.app/backend/health/live), [database readiness](https://ai-engineering-cloud-platform.vercel.app/backend/health/ready), and [integration status](https://ai-engineering-cloud-platform.vercel.app/backend/health/integrations).

## Local frontend
```bash
cd frontend
npm install
npm run build
npm run dev
```
Open http://localhost:3000.

## Local backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```
Open http://localhost:8000/health/live.

For tests that mock OpenAI responses, explicitly select the OpenAI provider in the test; the CI default is Ollama.

The database readiness endpoint requires a configured PostgreSQL connection.
Never commit credentials. Use environment variables. JWT authentication and route-level
RBAC denial checks are implemented and covered by CI. The Langfuse delivery probe and a local
PostgreSQL backup restore drill were verified on 2026-11-25; actual RAG trace visibility in Langfuse
is still pending.

## Local AI Agent and blockchain MCP

Start the API, PostgreSQL, Redis and blockchain MCP server together:

```bash
docker compose -f docker-compose.yml -f docker-compose.mcp.yml up --build
```

The Compose override points the backend at `http://mcp:8001/mcp` using the
container service name. When running the API directly on the host, the adapter
defaults to `http://localhost:8001/mcp`; set `BLOCKCHAIN_MCP_URL` to override it.
The unified agent also needs Ollama reachable at `OLLAMA_BASE_URL` with the model
configured by `OLLAMA_MODEL`. Set `MONITORING_API_KEY` in the root `.env` file to pass it into the backend and enable
`GET /agent/metrics`; send it in the `X-Monitoring-Key` header. Missing
configuration returns 503 and an invalid key returns 401.

## Deployment
The Vercel frontend uses `frontend/` as the project root.
The backend is a separate service and must be deployed/configured separately.

## Verified project status — 2026-11-25

### Complete and verified
- Core FastAPI, PostgreSQL/pgvector, Redis, Docker and the Vercel/Render deployment path.
- Authenticated Agent workflow, Blockchain MCP tool discovery/call, and agent metrics authentication.
- n8n ChatGPT MCP connection and published chat workflow verified end to end on 2026-11-24; the workflow returned platform MCP status `OK`. No scheduled automation is configured because the current workflow is chat-triggered.
- Docker Desktop local Kubernetes backend deployment verified on 2026-11-25: rollout succeeded, pod `1/1 Running`, and `/health/live` plus `/health/ready` returned HTTP 200. The pod connected to local Compose PostgreSQL and Redis.
- PostgreSQL backup and restore drill passed locally on 2026-11-25: custom-format dump restored into an isolated check database with 14 public tables, 1 document and 1 chunk. The backup file remains local and is not committed.
- Langfuse OTLP delivery probe succeeded on 2026-11-25 and the app showed “Tesztspan fogadva”; this verifies test-span delivery, not yet visibility of a real RAG execution trace in Langfuse.
- Private RAG upload, indexing and source-verified answer on a real PDF; live stage timings were returned.
- VQE and QAOA simulation. QAOA output now includes an exact classical exhaustive-search baseline for the current three-node graph.
- Route-level RBAC denial checks for unauthenticated and insufficient-role MLOps writes.
- Real-provider RAG retrieval benchmark: Ollama `nomic-embed-text`, 1,536 dimensions, 6 queries, Recall@3 1.00 and MRR@3 1.00 on the labeled evaluation dataset.
- Latest merged commit `8615052` is deployed on Render (`live`) and Vercel (`READY`); the Render service returned HTTP 200 from `/health/live`, `/health/ready`, and `/health/integrations` during release verification.
- CI checks for the merged changes, including backend, frontend, security audit, Docker Compose and Kubernetes manifest validation.

### Still open
- **Cloud / Terraform (optional):** production cloud cluster deployment and Terraform are deferred until a provider is selected; the local Docker Desktop Kubernetes deployment is verified.
- **FinOps / Vercel:** `VERCEL_ACCESS_TOKEN` was rotated in the Render `ai-engineering-api` environment and the redeployment succeeded on 2026-11-25. Retrying `Fetch Vercel costs` with the new token still returned “Vercel FOCUS billing is not available for this account or team.” The application is configured; FOCUS billing data is unavailable for the current Vercel account/team. Use the Vercel dashboard for invoices and actual charges.
- **Langfuse:** confirm that an actual RAG execution trace appears in the Langfuse project; the content-free delivery probe has already succeeded.


## RAG retrieval quality measurement

The provider-backed benchmark embeds its built-in passages and questions using the
currently configured `EMBEDDING_PROVIDER` (Ollama or OpenAI), ranks passages by
cosine similarity, and reports Recall@k and MRR with per-question results. It does
not access uploaded user documents or write to the database. The first measured
baseline used Ollama `nomic-embed-text` (1,536 dimensions) and scored Recall@3 1.00
and MRR@3 1.00 across six labeled questions. This result applies to this evaluation
dataset and does not guarantee retrieval quality for every user document.

Run it from the repository root after the backend container is running:

```powershell
docker compose exec backend python /app/evaluate_rag_embeddings.py
```

## RAG token usage and optional cost estimate

The authenticated `POST /rag/multi-agent/ask` endpoint returns `answer`, `sources`, `verified`, and `usage`. The dashboard displays token counts and, when pricing is configured, a USD estimate. These are **per-request estimates**, not provider invoices or persistent billing records. Embedding token costs are not included.

Configure both environment variables in the backend service (USD per million tokens):

```dotenv
OPENAI_INPUT_USD_PER_1M=<current_input_rate>
OPENAI_OUTPUT_USD_PER_1M=<current_output_rate>
```

Use verified current prices for the configured model (`gpt-4.1-mini`). If either variable is absent or invalid, `estimated_cost_usd` is `null` rather than a fabricated cost. Do not commit secrets or API keys.

## Production verification checklist

1. GitHub Actions: both backend and frontend jobs successful on the latest commit.
2. Render: `/health/live` returns HTTP 200 and `/health/ready` reports PostgreSQL connected.
3. Vercel: dashboard loads and reports backend status correctly.
4. Authenticated RAG: upload PDF, index, ask a question, verify citations and token usage.
5. Security: no API keys in frontend, JWT remains required for protected routes.
6. Langfuse: the content-free OTLP delivery probe is verified; confirm an actual RAG trace in the Langfuse project before calling production tracing fully verified.
