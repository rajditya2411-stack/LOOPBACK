# CONTEXT.md – LoopBack Project Context

> Last updated: 2026-07-16

---

## Project Overview

**LoopBack** is a modern AI-powered productivity workspace that combines AI Chat, Document Intelligence (RAG), Task Management, Goal Tracking, Analytics, Memory, Search, and Workspace Collaboration into a single calm, minimalist interface inspired by Nothing OS.

**Tagline:** Remember More. Work Smarter.

---

## Architecture Summary

```
┌─────────────┐         ┌─────────────────┐
│  Next.js 16  │  HTTP   │    FastAPI       │
│  (Frontend)  │◄───────►│    (Backend)     │
│  Port: 3000  │  REST   │    Port: 8000    │
└─────────────┘   +SSE   └────────┬────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
              │  SQLite    │ │  ChromaDB  │ │ Cloudflare│
              │ loopback.db│ │ (Vectors)  │ │Workers AI │
              └───────────┘ └───────────┘ └───────────┘
```

- **Frontend → Backend:** REST API + Server-Sent Events (SSE) for AI streaming
- **Backend → SQLite:** All relational data (users, chats, tasks, goals, etc.)
- **Backend → ChromaDB:** Vector embeddings for semantic search (documents, memories)
- **Backend → Cloudflare Workers AI:** LLM inference (Kimi K2.6), embeddings (BGE-M3)

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | Next.js (App Router) | 16 |
| UI Library | React | 19 |
| Language (FE) | TypeScript | Strict |
| Styling | Tailwind CSS | v4 |
| Component Library | shadcn/ui | Latest |
| Animation | Framer Motion | Latest |
| State Management | Zustand | Latest |
| Data Fetching | TanStack Query | Latest |
| Forms | React Hook Form + Zod | Latest |
| Icons | Lucide React | Latest |
| Backend Framework | FastAPI | 0.115.x |
| Language (BE) | Python | 3.11+ |
| ORM | SQLAlchemy (async) | 2.0.x |
| Database | SQLite (aiosqlite) | — |
| Migrations | Alembic | 1.15.x |
| Auth Tokens | python-jose (JWT) | 3.4.x |
| Password Hashing | argon2-cffi (Argon2id) | 23.x |
| AI Provider | Cloudflare Workers AI | — |
| Primary LLM | Kimi K2.6 | — |
| Fallback LLMs | Qwen 3, Llama 4 Scout | — |
| OCR | EasyOCR | 1.7.x |
| PDF Parsing | PyMuPDF | 1.25.x |
| Embeddings | BGE-M3 | — |
| Vector Database | ChromaDB | 1.0.x |

---

## Folder Structure

```
loopback/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI route handlers
│   │   │   ├── __init__.py
│   │   │   ├── auth.py       # register, login, logout, refresh, forgot-password
│   │   │   ├── users.py      # profile CRUD, change password, delete account
│   │   │   └── settings.py   # GET/PUT /api/settings (user preferences)
│   │   ├── core/             # Config, security, dependencies
│   │   │   ├── __init__.py
│   │   │   ├── config.py     # Pydantic Settings (.env loading)
│   │   │   ├── deps.py       # get_current_user auth dependency
│   │   │   └── security.py   # JWT + Argon2id utilities
│   │   ├── database/         # SQLAlchemy setup
│   │   │   ├── __init__.py
│   │   │   ├── base.py       # DeclarativeBase
│   │   │   ├── session.py    # Async engine + session factory
│   │   │   └── seed.py       # Demo data seeder
│   │   ├── models/           # SQLAlchemy ORM models (12 models, 11 tables)
│   │   │   ├── __init__.py   # Re-exports all models
│   │   │   ├── user.py       # User
│   │   │   ├── chat.py       # Chat, Message
│   │   │   ├── document.py   # Document, DocumentChunk
│   │   │   ├── task.py       # Task (self-referential for subtasks)
│   │   │   ├── goal.py       # Goal
│   │   │   ├── memory.py     # Memory
│   │   │   ├── notification.py # Notification
│   │   │   ├── workspace.py  # Workspace, WorkspaceMember
│   │   │   └── settings.py   # UserSettings
│   │   ├── schemas/          # Pydantic v2 validation schemas
│   │   │   ├── __init__.py   # Re-exports all schemas
│   │   │   ├── user.py       # UserCreate, UserLogin, UserRead, TokenPair, etc.
│   │   │   ├── chat.py       # ChatCreate, ChatRead, MessageCreate, etc.
│   │   │   ├── document.py   # DocumentRead, DocumentSearchResult, etc.
│   │   │   ├── task.py       # TaskCreate, TaskRead, TaskReorder, etc.
│   │   │   ├── goal.py       # GoalCreate, GoalRead, GoalUpdate
│   │   │   ├── memory.py     # MemoryCreate, MemoryRead, MemoryUpdate
│   │   │   ├── notification.py # NotificationRead, NotificationUpdate
│   │   │   ├── workspace.py  # WorkspaceCreate, WorkspaceMemberAdd, etc.
│   │   │   ├── settings.py   # UserSettingsRead, UserSettingsUpdate
│   │   │   └── common.py     # MessageResponse, PaginatedResponse
│   │   ├── services/         # Business logic (auth service and future domain services)
│   │   ├── workers/          # Background task processors (placeholder)
│   │   ├── mcp/              # Transport-neutral MCP JSON-RPC runtime
│   │   ├── __init__.py
│   │   └── main.py           # FastAPI app entry point
│   ├── alembic/              # Database migrations
│   │   ├── env.py            # Async migration env
│   │   ├── script.py.mako    # Migration template
│   │   └── versions/         # Migration files
│   ├── uploads/              # File storage (documents/, images/, audio/, temp/)
│   ├── alembic.ini
│   ├── .env.example
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   �│   │   │   └── api.ts        # Typed fetch client (auth, upload, SSE streaming)
│   │   └── store/
│   │       ├── auth-store.ts  # Auth state (login, register, logout, fetchUser)
│   │       └── ui-store.ts    # UI state (sidebar, theme, command palette)
│   ├── package.json
│   └── tsconfig.json
│
├── CONTEXT.md               # This file
├── CLAUDE.md                # AI assistant memory
├── README.md                # Setup instructions
└── prompt.md                # Original project spec
```

---

## Database Schemath route group (no sidebar)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── forgot-password/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (dashboard)/   # Authenticated app shell
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── chat/page.tsx
│   │   │   │   ├── documents/page.tsx
│   │   │   │   ├── tasks/page.tsx
│   │   │   │   ├── goals/page.tsx
│   │   │   │   ├── analytics/page.tsx
│   │   │   │   ├── memory/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   ├── globals.css   # Design system (Stitch tokens)
│   │   │   ├── layout.tsx    # Root layout (fonts, Providers)
│   │   │   └── page.tsx      # Redirects to /login
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── sidebar.tsx  # Collapsible sidebar nav
│   │   │   ├── command-palette.tsx # Global command palette
│   │   │   └── providers.tsx    # TanStack Query provider
│   │   ├── lib/
│   │   │   └── api.ts        # Typed fetch client (auth, upload, SSE streaming)
│   │   └── store/
│   │       ├── auth-store.ts  # Auth state (login, register, logout, fetchUser)
│   │       └── ui-store.ts    # UI state (sidebar, theme, command palette)
│   ├── package.json
│   └── tsconfig.json
│
├── CONTEXT.md               # This file
├── CLAUDE.md                # AI assistant memory
├── README.md                # Setup instructions
└── prompt.md                # Original project spec
```

---

## Database Schema

### Tables (11)

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `users` | User accounts | id, email, hashed_password, full_name, is_active |
| `chats` | Chat conversations | id, user_id (FK), title |
| `messages` | Chat messages | id, chat_id (FK), role, content |
| `documents` | Uploaded documents | id, user_id (FK), title, file_path, file_type, status |
| `document_chunks` | RAG text chunks | id, document_id (FK), content, chunk_index, embedding_id |
| `tasks` | Task items | id, user_id (FK), parent_id (self FK), title, status, priority |
| `goals` | Goal tracking | id, user_id (FK), title, category, progress |
| `memories` | Semantic memories | id, user_id (FK), content, category, is_pinned, embedding_id |
| `notifications` | User notifications | id, user_id (FK), title, type, is_read |
| `workspaces` | Collaborative spaces | id, name, owner_id (FK) |
| `workspace_members` | Membership | id, workspace_id (FK), user_id (FK), role |
| `user_settings` | Per-user prefs | id, user_id (FK), theme, ai_model, ai_memory_enabled |

All tables use UUID primary keys, timestamps (created_at, updated_at), and cascade deletes on foreign keys.

---

## API Endpoints

### Implemented ✅

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout (stateless) |
| POST | `/api/auth/forgot-password` | Request password reset email |
| GET | `/api/users/me` | Get current user profile |
| PUT | `/api/users/me` | Update profile |
| PUT | `/api/users/me/password` | Change password |
| DELETE | `/api/users/me` | Delete account |

| POST | `/api/auth/reset-password` | Complete password reset |
| GET | `/api/chats` | List chats |
| POST | `/api/chats` | Create chat |
| GET | `/api/chats/{chat_id}` | Get chat + messages |
| DELETE | `/api/chats/{chat_id}` | Delete chat |
| POST | `/api/chats/{chat_id}/messages/stream` | Stream AI chat |

### Incomplete / unverified 🔲

- Document CRUD + upload + RAG pipeline
- Task CRUD + Kanban reorder
- Goal CRUD + progress
- Memory CRUD + semantic search
- Analytics aggregation
- Global search (hybrid)
- Notifications CRUD
- Workspace CRUD + members

### Settings ✅

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get authenticated user's settings |
| PUT | `/api/settings` | Partially update user settings |

---

## MCP Servers

`app/mcp/server.py` implements a transport-neutral JSON-RPC runtime with lifecycle hooks, tool discovery, routing, and structured errors. No domain tools or external MCP transport adapter are registered yet.

---

## AI Models and Providers

| Role | Provider | Model |
|------|----------|-------|
| Primary LLM | Cloudflare Workers AI | Kimi K2.6 (`@cf/moonshotai/kimi-k2.6`) |
| Fallback LLM | Cloudflare Workers AI | Qwen 3 (`@cf/qwen/qwen3-32b`) |
| Fallback LLM | Cloudflare Workers AI | Llama 4 Scout |
| Embeddings | Cloudflare Workers AI | BGE-M3 |
| OCR | Local | EasyOCR |
| PDF | Local | PyMuPDF |

---

## Environment Variables

See `backend/.env.example` for full list. Key variables:
- `DATABASE_URL` – SQLite connection string
- `JWT_SECRET_KEY` – JWT signing secret
- `CLOUDFLARE_ACCOUNT_ID` – Cloudflare account
- `CLOUDFLARE_API_TOKEN` – Workers AI API token
- `FRONTEND_URL` – CORS origin (default: http://localhost:3000)

---

## Current Implementation Status

### ✅ Completed

- Project scaffolding (backend + frontend)
- Backend: FastAPI app with CORS, lifespan, static files
- Backend: All 12 SQLAlchemy models with relationships
- Backend: All Pydantic v2 schemas
- Backend: Security module (JWT + Argon2id)
- Backend: Auth dependency (get_current_user)
- Backend: Auth API (register, login, refresh, logout, forgot-password)
- Backend: User API (profile CRUD, change password, delete account)
- Backend: Alembic setup (async env.py, migration template)
- Backend: Database seed script with demo data
- Frontend: Next.js 16 scaffolded (App Router, TypeScript, Tailwind v4)
- Frontend: Design system CSS (Stitch tokens → CSS vars → Tailwind theme)
- Frontend: Dark mode support via CSS variables
- Frontend: Typed API client with auth, upload, and SSE streaming
- Frontend: Zustand stores (auth, UI)
- Frontend: TanStack Query provider
- Frontend: Login page
- Frontend: Register page
- Frontend: Forgot Password page
- Frontend: Middleware auth guard with cookie-backed redirects
- Frontend: Authenticated dashboard layout with sidebar shell
- Frontend: Initial dashboard page
- Frontend: Sidebar navigation component
- Frontend: Global command palette with Ctrl/Cmd+K
- Frontend: Workspace section pages for chat, documents, tasks, goals, analytics, memory, and settings
- Documentation: README.md, CLAUDE.md, CONTEXT.md
- Backend: Refresh token rotation flow
- Backend + Frontend: Password reset flow
- Backend + Frontend: AI Chat with streaming and UI
- Backend + Frontend: Documents & RAG pipeline (Core Upload)
- Backend + Frontend: Tasks (Kanban)
- Backend + Frontend: Goals
- Backend + Frontend: Analytics
- Backend + Frontend: Memory
- Backend + Frontend: Global search (Ctrl+K)
- Backend + Frontend: Notifications
- Backend + Frontend: Workspaces
- Backend + Frontend: Settings (GET/PUT /api/settings, live preferences page, theme sync)

### 🔲 Pending / limited

- Workspace role management and resource-level authorization
- Domain MCP tools and an external MCP transport adapter
- Real-time notification delivery
- Live Cloudflare Workers AI, OCR, and browser E2E verification

---

## Known Issues

- Route protection depends on browser cookies mirrored from the auth store so Next middleware can enforce redirects
- Alembic migrations are now authoritative; deployments must run `alembic upgrade head` before starting the API.
- PyMuPDF and EasyOCR are optional runtime dependencies; PDF/image processing is marked failed if they are unavailable.
- E2E tests require locally running frontend and backend services plus Playwright Chromium.

---

## Technical Decisions

1. **SQLite over PostgreSQL** – Simplicity for local dev; no Docker dependency.
2. **Async SQLAlchemy** – aiosqlite driver for non-blocking DB access.
3. **Argon2id** – OWASP-recommended password hashing over bcrypt.
4. **Stateless JWT** – No token blacklist; client discards tokens on logout.
5. **Tailwind v4** – Uses `@theme inline` blocks instead of tailwind.config.js.
6. **Geist + JetBrains Mono** – Typography from Stitch design system.
7. **No third-party auth** – Native email/password only per spec.
8. **FastAPI BackgroundTasks** – No Celery/Redis for background jobs.
9. **SSE for streaming** – AI chat responses streamed via Server-Sent Events.

---

## Development Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Scaffolding & Infrastructure | ✅ Done |
| 2 | Authentication System | ✅ Done |
| 3 | Dashboard & Layout | ✅ Done |
| 4 | AI Chat (Streaming) | ✅ Done |
| 5 | Documents & RAG (Core API) | ✅ Done |
| 6 | Tasks & Goals (Core API) | ✅ Done |
| 7 | Analytics & Memory (Core API) | ✅ Done |
| 8 | Search, Notifications, Workspaces | ✅ Done |
| 9 | Tasks (Full Kanban) | ✅ Done |
| 10 | Documents (Full RAG Pipeline) | ✅ Done |
| 11 | Settings (Full Vertical Slice) | ✅ Done |
| 12 | MCP Integration | 🟡 Runtime foundation only; no domain tools registered |

---

## Changelog

### 2026-07-14
- Initial project scaffolding
- Created backend with FastAPI, SQLAlchemy models, Pydantic schemas, auth system
- Created frontend with Next.js 15, design system, auth pages, sidebar
- Created documentation (README.md, CLAUDE.md, CONTEXT.md)
- Added forgot-password page, middleware auth guard, cookie-backed auth mirroring, dashboard layout, and initial dashboard page
- Added global command palette, route shortcuts, and shell actions with keyboard navigation
- Added the missing dashboard route pages for chat, documents, tasks, goals, analytics, memory, and settings
- Finished Authentication System (refresh token rotation interceptor, reset-password API and UI flow)
- Built AI Chat streaming system integrating Cloudflare Workers AI with backend Server-Sent Events and functional React UI
- Added Core APIs (CRUD) and Frontend integrations for Tasks, Goals, Memory, Analytics, and Documents
- Implemented Global Hybrid Search API and connected it to the Command Palette
- Implemented Notifications backend API and frontend slide-out panel
- Implemented Workspaces backend API and frontend settings view
- Added a drag-and-drop Kanban board and authenticated task reorder endpoint.
- Added document extraction (PDF, TXT, Markdown, and image OCR), chunking, ChromaDB indexing, BGE-M3 embedding integration, SQL fallback retrieval, and RAG context injection for chat.
- Added an async MCP-compatible tool registry for domain servers.
- Replaced password-reset token logging with SMTP delivery and a local development `.eml` outbox fallback; added public auth endpoint rate limiting.

### 2026-07-16
- Implemented Settings vertical slice: `GET /api/settings` + `PUT /api/settings` with authentication, partial updates, and ai_temperature validation.
- Replaced static Settings placeholder page with a live `"use client"` page: loads on mount, loading skeleton, error/retry state, editable form panels (Appearance, AI preferences, Notifications, Storage), unsaved-change detection, success/error toast, disabled Save guard, and live theme sync into `useUIStore`.
