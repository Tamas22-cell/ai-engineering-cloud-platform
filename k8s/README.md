# Kubernetes backend deployment template

This is an **unapplied template**, not a production deployment. It targets an existing Kubernetes cluster and external PostgreSQL/Redis services.

1. Build and publish the backend image from `backend/Dockerfile` to a registry accessible by the cluster.
2. Replace `REPLACE_OWNER` and `REPLACE_TAG` in `backend.yaml` with the actual image reference.
3. Create a Kubernetes Secret named `ai-engineering-api-secrets` in the target namespace, containing the required backend configuration, including `DATABASE_URL`, `REDIS_URL` and `SECRET_KEY`. Never commit secrets.
4. Apply the manifest: `kubectl apply -f k8s/backend.yaml`.
5. Check: `kubectl rollout status deployment/ai-engineering-api`.

The backend container uses port 8000, and probes call `/health/live` and `/health/ready`. Database migrations must be managed separately before production rollout. The frontend, ingress, TLS, persistent storage and production security hardening are not included.

The existing Vercel/Render deployment is unchanged.
