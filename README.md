# AI Engineering Cloud Platform

<div align="center">

![AI Engineering Cloud Platform hero](./0440FF6D-F303-423D-9760-1CAFDCF56B8E.png)

### AI Engineering — Cloud · Agents · RAG · MLOps

<table><tr><td width="50%"><img src="./08CD1F7C-C8DA-4DC5-9310-DD9049ECBA9E.png" alt="AI Engineering visual 2" width="100%" /></td><td width="50%"><img src="./5BB3FDCC-EFC3-48E5-B018-D2D925714F45.png" alt="AI Engineering visual 3" width="100%" /></td></tr></table>

</div>

A standalone engineering portfolio project by Tamas Nemeth.

## Current state
- Responsive Next.js frontend: interactive navigation and honest module status cards.
- FastAPI backend deployed separately on Render; frontend is on Vercel. Use the live DevOps panel and health endpoints below to check current availability.
- GitHub Actions runs backend pytest and frontend build. [View workflow history](https://github.com/Tamas22-cell/ai-engineering-cloud-platform/actions).
- Authenticated Agent and private RAG workflows require sign-in; LLM and tool-calling modes require a server-side OpenAI API key.
- No fake agent count, uptime, cloud spend, security score or production monitoring.
- No Azure billing account or payment card required for this preview.

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

The database readiness endpoint requires a configured PostgreSQL connection.
Never commit credentials. Use environment variables. Backend auth/RBAC,
Langfuse and OpenTelemetry production exporters still need configuration and verification,
security tests and real evidence before they can be marked Verified.

## Deployment
The Vercel frontend uses `frontend/` as the project root.
The backend is a separate service and must be deployed/configured separately.

## Roadmap
1. Contract tests and backend security hardening.
2. Authentication + authorization/RBAC with negative tests.
3. RAG ingestion/retrieval and agent workflows.
4. Experiment tracking, traces and monitoring.
5. Staging deployment, cost guards and verified production checks.

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
6. Langfuse: production tracing is **not verified** until actual traces are observed.
