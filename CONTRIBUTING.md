# Contributing to LoopBack

Thanks for helping make LoopBack a durable, local-first open-source workspace.

## Development

Install Python 3.11+, Node.js 20+, and the dependencies described in the README. Run the backend tests with `cd backend && .venv\\Scripts\\python.exe -m pytest -q` and verify the frontend with `cd frontend && npm run build`.

Keep provider integrations behind `ProviderManager`, never commit API keys, and keep all routes scoped to the authenticated user. Add tests for new API behavior and update the relevant documentation. Pull requests should explain the user impact, migration needs, and verification performed.

## Security

Do not report credentials or private user content in logs. For suspected vulnerabilities, follow `SECURITY_CHECKLIST.md` and contact the maintainers privately rather than opening a public issue with exploit details.
