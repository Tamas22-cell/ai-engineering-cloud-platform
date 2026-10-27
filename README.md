# AI Engineering Cloud Platform

<div align="center">

![AI Engineering Cloud Platform hero](./0440FF6D-F303-423D-9760-1CAFDCF56B8E.png)

### AI Engineering — Cloud · Agents · RAG · MLOps

<table><tr><td width="50%"><img src="./08CD1F7C-C8DA-4DC5-9310-DD9049ECBA9E.png" alt="AI Engineering visual 2" width="100%" /></td><td width="50%"><img src="./5BB3FDCC-EFC3-48E5-B018-D2D925714F45.png" alt="AI Engineering visual 3" width="100%" /></td></tr></table>

</div>

A standalone engineering portfolio project by Tamas Nemeth.

## Current state
- Responsive Next.js frontend: interactive navigation and honest module status cards.
- Local FastAPI backend: liveness and database readiness routes (not deployed on Vercel).
- Automated checks are configured. Production integrations remain **unverified**.
- No fake agent count, uptime, cloud spend, security score or production monitoring.
- No Azure billing account or payment card required for this preview.

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
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Open http://localhost:8000/health/live.

The database readiness endpoint requires a configured PostgreSQL connection.
Never commit credentials. Use environment variables. Backend auth/RBAC,
Langfuse and OpenTelemetry production exporters still need implementation,
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
