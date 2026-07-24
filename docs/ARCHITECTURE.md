# LoopBack architecture

LoopBack is a local-first Next.js and FastAPI application backed by SQLite, SQLAlchemy, and Alembic. The browser talks to authenticated REST endpoints and SSE chat streams; provider credentials remain on the backend and are never returned to the frontend.

The AI boundary is `ProviderManager -> ProviderConfig -> provider adapter`. OpenAI, xAI, and Kimi use the shared OpenAI-compatible adapter; Gemini and Anthropic translate their native request/response shapes. Chat, study evaluation, and future AI features depend on this boundary rather than vendor SDKs.

Documents are uploaded to local storage, extracted and chunked, then indexed for user-scoped retrieval. The learning loop adds persisted `LearningSession` records: a document creates an active-recall prompt, the learner submits an explanation, and the selected provider returns structured feedback. `/api/learning/profile` aggregates those sessions into scores, strengths, weak topics, revision concepts, streaks, and a heatmap-ready dataset.

Schema changes belong in `backend/alembic/versions`. Run `alembic upgrade head` before starting a deployment. The application deliberately does not apply migrations during startup.
