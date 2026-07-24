# Production security checklist

- [ ] Replace `LOOPBACK_JWT_SECRET_KEY` with a randomly generated secret and rotate it through the deployment secret manager.
- [ ] Set `LOOPBACK_DEBUG=false`; never expose `.env`, SQLite files, uploads, or Chroma data publicly.
- [ ] Set `LOOPBACK_FRONTEND_URL` to the deployed frontend origin, or configure the JSON `LOOPBACK_CORS_ALLOW_ORIGINS` allow-list when multiple origins are required.
- [ ] Run `alembic upgrade head` as a release step using a backup and rollback plan.
- [ ] Put the API behind TLS and a reverse proxy with request-size and rate limits.
- [ ] Verify `backend/.env` is not committed. If a credential was ever committed, rotate it and scrub the secret-bearing history before publishing the repository.
- [ ] Review JWT expiry, password-reset delivery, account deletion, and authorization checks.
- [ ] Run dependency scanning and image scanning in CI.
- [ ] Confirm logs contain request IDs but never tokens, passwords, reset links, or document contents.
- [ ] Back up the database and uploaded documents; test restoration.
