# LoopBack — Project Context & Architecture Reference

> **Purpose of this document:** Provide complete, persistent architectural and workflow context for any AI assistant or developer joining this repository in a new chat session. Always read this file before making changes.

---

## 1. Executive Summary & Product Vision

**LoopBack** is a private, on-device AI productivity and study companion designed for students and researchers. It combines strict Retrieval-Augmented Generation (RAG), local search, AI memory & custom preferences, hierarchical academic planning (Projects, Milestones, and Kanban Tasks), and focused study workflows into an approachable, high-density, minimalist interface inspired by **Notion** and **ElevenLabs**.

### Core Value Proposition
- **Private & On-Device:** Runs locally with zero telemetry tracking or cloud dependencies required for daily operation.
- **Strict Grounding:** Every AI response is verified against local notes with clear citations and relevant passage inspection.
- **AI Memory & Preferences:** Remembers the user's research rules, study preferences, and custom instructions with user control to approve, reject, or delete anytime.
- **Actionable Academic Planning:** Unifies strategic deadlines (Milestones) and tactical execution items (Tasks) under Academic Projects, with direct one-click integration to launch grounded AI study sessions.
- **Self-Contained Workspaces:** Full export and restore of self-contained `.zip` bundles containing relational schemas, SQLite databases, study notes, and media caches for complete offline portability.

---

## 2. Monorepo Structure & Appliance Heads

The repository is organized into distinct specialized heads:

```
LoopBack/
├── backend/                  # FastAPI backend server (Python 3.11+, SQLAlchemy 2.0, ChromaDB)
│   ├── app/
│   │   ├── api/              # REST routers: auth, chat, documents, goals, learning, memory,
│   │   │                     # notifications, productivity, analytics, search, settings, tasks, users, workspaces
│   │   ├── core/             # Config, security, database session, Windows asyncio setup
│   │   ├── models/           # SQLAlchemy 2.0 async models (Task, Goal, Memory, Document, LearningSession, User, Workspace)
│   │   ├── schemas/          # Pydantic v2 validation schemas
│   │   └── services/         # Business logic: RAG vectorization, memory extraction, chat streaming, AI providers
│   ├── alembic/              # Database migration versions
│   └── run_dev.py            # Deterministic port-binding local server launcher
│
├── frontend/                 # Student Appliance Web UI (Active Head)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/       # Authentication views (login, register, forgot-password, reset-password)
│   │   │   ├── (dashboard)/  # Main dashboard layout and pages:
│   │   │   │   ├── dashboard/page.tsx       # Cockpit, focus timer, velocity metrics, quick capture
│   │   │   │   ├── chat/page.tsx            # AI study companion, compact vector popover, streaming
│   │   │   │   ├── documents/page.tsx       # Dual-tab Document Library + Cognitive Memory Workbench
│   │   │   │   ├── documents/[id]/page.tsx  # Document detail, chunk preview, active-recall study session
│   │   │   │   ├── tasks/page.tsx           # Milestones velocity strip, 4-stage Kanban, Dynamic Courses
│   │   │   │   ├── workspaces/page.tsx      # Enclave knowledge bundles, offline zip export/import, storage telemetry
│   │   │   │   ├── settings/page.tsx        # Hardware telemetry, BYOK providers, epistemic guardrails, academic profile
│   │   │   │   ├── analytics/page.tsx       # Redirects to unified Dashboard Cockpit
│   │   │   │   ├── goals/page.tsx           # Redirects to unified Milestones & Tasks Board
│   │   │   │   ├── memory/page.tsx          # Redirects to unified Knowledge & Memory tab
│   │   │   │   ├── profile/page.tsx         # Redirects to Settings Academic Profile
│   │   │   │   └── search/page.tsx          # Universal ⌘K Command Palette trigger & redirect
│   │   │   ├── globals.css                  # Custom Notion/ElevenLabs design tokens and CSS variables
│   │   │   └── layout.tsx                   # Root layout with Material Symbols and font definitions
│   │   ├── components/       # Shared UI components (Sidebar, Header, Modals, CommandPalette)
│   │   ├── lib/              # API client wrapper (api.get, api.post, api.put, api.delete, api.upload)
│   │   └── store/            # Zustand stores for auth, UI state, notifications, and workspaces
│   └── package.json          # Next.js 16 (Turbopack), Tailwind CSS v4, Lucide/Material Symbols
│
├── ca_frontend/              # Chartered Accountant domain head (FROZEN — DO NOT TOUCH)
├── law_frontend/             # Legal domain head (FROZEN — DO NOT TOUCH)
└── context.md                # Persistent project context documentation (this file)
```

> **IMPORTANT BOUNDARY RULE:** Never modify or edit files inside `ca_frontend/` or `law_frontend/`. All current work is strictly focused on `frontend/` (the Student Appliance) and `backend/`.

---

## 3. Design System & Stitch UI Guidelines

The Student Appliance UI adopts a Google Stitch design with extreme minimalism:
- **Aesthetic Principles:** Calm, restrained, high information density, zero gratuitous gradients or decorative noise. Follows Notion, ElevenLabs, and Linear.
- **Typography:**
  - Headlines: `Geist` (`font-headline`)
  - Body & Labels: `Inter` (`font-sans`)
  - Code, Telemetry & Tags: `JetBrains Mono` (`font-mono`)
- **Color Palette & Contrast:**
  - Neutral monochrome surface hierarchy (`--surface`, `--surface-container-low`, `--surface-container-lowest`).
  - Dark/Charcoal typography (`--on-surface`, `--on-surface-variant`).
  - Subtle semantic accents: Primary Blue (`#3525cd`), Tertiary Ochre (`#7e3000`), Emerald Green (`#059669`) for completion, Ruby Error (`#ba1a1a`) for urgency.
- **Icons:** Material Symbols Outlined loaded from Google Fonts CDN, complemented by lightweight Lucide icons where needed.
- **Layout:** High density 240px sidebar, compact breadcrumb header bar, and clean content cards.

---

## 4. Implemented Modules & Features (Current State)

### A. Dashboard & Cockpit (`/dashboard`)
- **Actionable Hero Banner:** Displays greeting, live term status, and dynamic urgent task count. Urgent tasks are rendered as individual clickable chips (`[ 🔴 Implement Red-Black tree deletion fixup ]`) that navigate directly to `/tasks`. Includes an `[ Open Milestones → ]` shortcut button.
- **Pomodoro Focus Timer:** 25-minute study interval timer with live countdown and audio-visual completion states.
- **Study Velocity & Throughput:** Interactive toggle between Focus Blocks, Tasks Completed, and Accuracy Percentage.
- **Quick Task Capture:** In-place creation of tactical to-do items directly connected to `POST /api/tasks`.
- **Course Materials Upload:** Quick file upload button wired directly to `POST /api/documents/upload` with local processing feedback.
- **Course Materials Breakdown & Study Activity Cards:** Clean visual breakdown of lecture notes, readings, and pending study deliverables.
- **Real Backend Data:** Fully connected to `GET /api/tasks`, `GET /api/goals`, and `GET /api/documents` with task checkbox status toggling via `PUT /api/tasks/{id}`. Zero hardcoded placeholder data.

### B. AI Study Companion (`/chat`)
- **Thread Management:** Left sub-rail listing conversation sessions organized by recency (`Today`, `Previous 7 Days`, `Earlier`), connected to `GET /api/chats`, `POST /api/chats`, `PUT /api/chats/{id}`, and `DELETE /api/chats/{id}`.
- **Capacity & Workspace Info:** Visual context capacity bar paired with active workspace name (`Workspace: Active Vault`) and indexed note status (`Connected Notes: All Indexed`).
- **Grounded Verification:** Responses display clean verification badges (`✓ Verified Source`), clear document citations (`[ 📄 Lecture Excerpt · p. 28 ]`), and concise relevant passage popovers.
- **Study Session Pre-loading:** URL parameters (`/chat?milestone=...&project=...&title=...`) automatically spawn a focused inquiry thread pre-grounded in the given subject.
- **Streaming Responses:** Backend SSE streaming via `POST /api/chats/{id}/messages/stream`.

### C. Knowledge & AI Memory (`/documents`)
- **Dual-Tab Segmented Switcher:** Top toggle cleanly switches between **Document Library** and **AI Memory & Preferences**.
- **Tab 1: Document Library (`/api/documents`):**
  - Search bar with `⌘F` trigger across notes, titles, and formats.
  - Format filtering (All, PDF, DOCX, Markdown).
  - Drag-and-drop document upload via `POST /api/documents/upload`.
  - Right-hand Document Details inspector displaying file format, on-device state, and local encrypted storage.
- **Tab 2: AI Memory & Preferences (`/api/memory`):**
  - Displays user knowledge rules, study preferences, facts, and custom instructions.
  - Review queue for auto-extracted memories: user can click **Approve** (`POST /api/memory/{id}/approve`) or **Reject** (`POST /api/memory/{id}/reject`).
  - **+ Add Custom Rule** modal for manual instruction creation.
  - Custom Rule Details inspector and deletion controls.

### D. Active-Recall Study Mode (`/documents/[id]`)
- **Extracted Chunks Preview:** Visual inspection of vectorized document chunks and page numbers.
- **Active-Recall Study Generation:** Spawns targeted prompts via `POST /api/learning/documents/{id}/study` based on parsed document chunks without revealing the source text.
- **AI Pedagogical Evaluation:** Submits the learner's explanation via `POST /api/learning/sessions/{session_id}/explanation` and displays pedagogical analysis:
  - Quantitative metrics: overall score, accuracy percentage, and conceptual quality.
  - Formative insights: misconceptions identified, missing concepts, learner strengths, and recommended revision schedules.
- **Historical Session Tracking:** Lists past active-recall attempts and feedback logs via `GET /api/learning/documents/{id}/sessions`.

### E. Milestones & Kanban Tasks (`/tasks`)
- **Academic Taxonomy Architecture:**
  1. **Academic Projects:** Group related syllabus subjects into high-level containers (e.g. `CHEM CH1: Organic Mechanisms`, `MATH201: Multivariable Vector Fields`). Enables multi-milestone study without bloated single chats.
  2. **Milestones:** Strategic macro deliverables and exam deadlines (e.g., *Calculus II Midterm Exam*) tracked by syllabus coverage percentage (0% - 100%) and target date, backed by `/api/goals`.
  3. **Tasks:** Atomic, tactical study tasks tracked across a 4-column Kanban board (`To Do`, `In Progress`, `Peer Review`, `Mastered / Done`), backed by `/api/tasks`.
- **Dynamic Courses Management:**
  - Removed all hardcoded course lists.
  - Users can create custom courses via `+ Course` modal (specifying course code like `BIO101`, title, and color badge).
  - Users can delete custom courses by hovering over course filter pills.
- **AI Chat Linking ("Launch Study Session"):**
  - Every milestone card and inspection modal features a **`✦ Launch Study Session`** button that opens `/chat` pre-populated with that milestone and project context.
  - Every Kanban task card features a **`✦ Study`** button for focused, scoped AI inquiry.
- **Backend Persistence & Zero Placeholder Data:**
  - Tasks persist via `/api/tasks` (`PUT /api/tasks/{id}` for moving across Kanban columns).
  - Milestones persist via `/api/goals` (`PUT /api/goals/{id}` for updating progress percentage).
  - Clean empty state with a single-click **Load Sample Syllabus** button that seeds starter academic items.

### F. Workspaces & Knowledge Bundles (`/workspaces`)
- **Real Workspace Management:**
  - Create and manage isolated subject workspaces backed by `GET /api/workspaces`, `POST /api/workspaces`, and `DELETE /api/workspaces/{id}`.
  - Active workspace switching via `PUT /api/workspaces/active` with live sidebar synchronization.
- **Selective Resource Bundling (Item Selector):**
  - Checkbox-driven item selector modal allowing users to selectively attach or detach uploaded Documents (PDFs/DOCX/MD), AI Chat threads, Milestones, Tasks, and Cognitive Memories via `POST /api/workspaces/{id}/resources/batch`.
  - Filterable by resource type with search and instant counts breakdown.
- **100% Offline Air-Gapped Export (`GET /api/workspaces/{id}/export`):**
  - Exports a clean, structured `.loopback.zip` bundle containing:
    - `manifest.json`: Complete data schema for 1-click restore.
    - `README.md`: Human-readable summary of bundle contents.
    - `chats/*.md`: Readable Markdown transcripts of all included AI conversation turns and citations.
    - `tasks/tasks_overview.md` & `milestones/milestones_overview.md`: Clean Markdown tables of deliverables.
    - `documents/`: Original attached document binaries.
  - Supports selective filtering via `?resource_ids=...`.
- **100% Offline Air-Gapped Restore (`POST /api/workspaces/import`):**
  - Drag-and-drop or select a `.loopback.zip` archive to unpack and completely reconstruct workspaces, tasks, milestones, memories, documents, and chat threads with zero internet access required.
- **On-Demand PDF Generator (`POST /api/workspaces/{id}/generate-pdf`):**
  - Built directly into the Workspaces page (modal interface with zero separate routing).
  - Selectively compiles chosen content (chats, uploaded documents, milestones, tasks, cognitive memories) into an on-demand styled A4 PDF dossier using PyMuPDF (`fitz.Story` and `DocumentWriter`).
  - Supports two generation modes:
    - **Full Verbatim Compilation:** Renders complete unedited conversational chat bubbles, task priority/status tables, milestone roadmaps, document catalogs, and memory notes.
    - **AI Synthesis & Study Guide:** Feeds selected materials to the configured BYOK AI provider (`ProviderManager`) with customizable objective prompts (Study Guide, Executive Brief, Q&A Review) to synthesize an executive academic dossier.
  - Generates PDFs strictly on-demand without auto-generating during `.zip` export.

### G. Settings & Profile (`/settings`)
- **System Status & Diagnostics:**
  - Clean application health status showing Application Version (`LoopBack Student v2.4`), Privacy Mode (`Private & On-Device`), Local Database Health, and AI Assistant connection state.
- **BYOK Multi-Provider Architecture:**
  - Granular provider configuration supporting:
    - **Google Gemini:** Gemini 1.5 Flash (Fast & Responsive), Gemini 1.5 Pro (High Reasoning), Gemini 2.0 Flash
    - **Anthropic:** Claude 3.7 Sonnet, Claude 3.5 Haiku
    - **OpenAI:** GPT-4o, GPT-4o mini
    - **Ollama / Local Llama.cpp:** 100% local air-gapped inference
  - Private client-side key storage in encrypted SQLite; keys are never transmitted to external telemetry mirrors or third parties.
  - Safe credential validation probe via `POST /api/settings/ai/test` without leaking API keys.
- **AI Model Preferences & Memory:**
  - Response Creativity slider (Precise, Balanced, Creative).
  - AI Recall & Memory toggle allowing the assistant to remember key facts and preferences across study chats.
- **Verified Student Academic Profile:**
  - Displays Institution / College, Academic Email, Degree Scope, Term Standing, and Roll ID.
  - Interactive Edit Profile Details modal with instant on-device updates.

---

## 5. Backend Architecture & API Summary

The backend is built with **FastAPI** using asynchronous SQLAlchemy 2.0 and Alembic migrations.

### Key API Endpoints
| Resource | Method | Path | Description |
|---|---|---|---|
| **Auth** | POST | `/api/auth/register`, `/api/auth/login` | JWT user registration & login |
| | POST | `/api/auth/refresh`, `/api/auth/logout` | Token rotation & session termination |
| **Tasks** | GET, POST | `/api/tasks` | List or create Kanban tasks |
| | PUT, DELETE | `/api/tasks/{task_id}` | Update status/priority or delete task |
| **Goals** | GET, POST | `/api/goals` | List or create semester milestones |
| | PUT, DELETE | `/api/goals/{goal_id}` | Update progress/status or delete milestone |
| **Documents** | GET, POST | `/api/documents`, `/api/documents/upload` | List documents or upload & vectorize with local chunking |
| | GET, DELETE | `/api/documents/{id}` | Inspect document chunks or delete document & vector partition |
| | POST | `/api/documents/{id}/retry` | Retry processing for failed documents |
| | GET | `/api/documents/search` | User-scoped semantic vector search across documents |
| **Active Recall** | POST | `/api/learning/documents/{id}/study` | Generate active-recall prompt for document |
| | POST | `/api/learning/sessions/{id}/explanation` | Evaluate student explanation with pedagogical feedback |
| | GET | `/api/learning/documents/{id}/sessions` | List historical active-recall sessions for a document |
| | GET | `/api/learning/profile` | Long-term knowledge profile, mastery heatmap, and streak |
| **Cognitive Memory** | GET, POST | `/api/memory` | List or register cognitive memories |
| | POST | `/api/memory/{id}/approve` | Approve auto-extracted rule |
| | POST | `/api/memory/{id}/reject` | Reject auto-extracted rule |
| | DELETE | `/api/memory/{id}` | Delete memory rule |
| **AI Chat** | GET, POST | `/api/chats` | List or create chat conversations |
| | GET, PUT, DELETE | `/api/chats/{chat_id}` | Get messages, rename, or delete thread |
| | POST | `/api/chats/{id}/messages/stream` | Stream AI synthesis response via SSE |
| **Workspaces** | GET, POST | `/api/workspaces` | List or create isolated knowledge enclaves |
| | PUT | `/api/workspaces/active` | Switch active collaboration workspace |
| | GET, POST | `/api/workspaces/{id}/resources` | List or attach single resource |
| | POST | `/api/workspaces/{id}/resources/batch` | Batch attach selected items (docs, chats, tasks, goals, memories) |
| | POST | `/api/workspaces/{id}/resources/batch-remove` | Batch remove items from workspace |
| | GET | `/api/workspaces/{id}/export` | Export portable air-gapped `.loopback.zip` bundle with chat transcripts |
| | POST | `/api/workspaces/import` | Import and reconstruct `.loopback.zip` bundle offline with chats & docs |
| | POST | `/api/workspaces/{id}/generate-pdf` | On-demand styled A4 PDF dossier (Verbatim or AI Synthesis) |
| **Settings & BYOK** | GET, PUT | `/api/settings` | Read or partially update user settings & provider keys |
| | GET | `/api/settings/ai-provider` | Effective server-managed provider status |
| | POST | `/api/settings/ai/test` | Validate provider credentials via non-streaming probe |
| **Productivity** | GET | `/api/productivity/today` | Prioritized day plan |
| | POST | `/api/productivity/actions` | Execute quick workspace actions |
| **Analytics** | GET | `/api/analytics/dashboard` | Metric counts across all modules |
| | GET | `/api/analytics/weekly` | Weekly velocity and workload trends |
| **Search** | GET | `/api/search` | Unified hybrid cross-resource search (tasks, goals, docs, memory, chats) |
| **Notifications** | GET | `/api/notifications` | List user activity notifications |
| | PUT | `/api/notifications/{id}/read` | Mark notification as read |
| **Users** | GET, PUT | `/api/users/me` | Get or update user profile |
| | PUT | `/api/users/me/password` | Update account password |
| **Health** | GET | `/api/health` | Basic service health check |
| | GET | `/api/health/ready` | Deep readiness check (DB, Alembic, uploads, ChromaDB, AI provider) |

---

## 6. Development Workflow & Running the App

### Prerequisites
- Python 3.11+ in `backend/.venv`
- Node.js 18+ and npm in `frontend`

### Starting the Servers
1. **Start the FastAPI Backend:**
   ```powershell
   cd backend
   .\.venv\Scripts\python.exe run_dev.py
   ```
   - Automatically applies Alembic database migrations.
   - Publishes port to `backend/backend-port.txt`.
   - Listens by default at: `http://127.0.0.1:19000`
   - Interactive Swagger API docs: `http://127.0.0.1:19000/docs`

2. **Start the Next.js Frontend:**
   ```powershell
   cd frontend
   npm run dev
   ```
   - Runs Next.js with Turbopack on port 3010.
   - Web Application URL: `http://localhost:3010`

---

## 7. Strategic Architecture: Workspaces as Projects / Gems (Scoped RAG & Chat Encapsulation)

Workspaces function as **isolated project containers** directly equivalent to **ChatGPT Projects** or **Gemini Gems**:

### Architectural Paradigm
1. **Encapsulated Scope:**
   - Every Workspace encapsulates its own dedicated collection of uploaded documents (notes, slides, syllabus PDFs) and AI conversation threads.
   - When a student works within a workspace (e.g. *Math 201*), every new AI chat created is tied directly to that workspace.
2. **Strictly Scoped RAG Retrieval:**
   - When asking a question inside the *Math* workspace, vector search and context retrieval strictly query **only** the documents attached to that specific workspace.
   - Physical or unrelated documents (e.g. *Physics Mechanics*, *Biochemistry*) are completely ignored during retrieval.
3. **Core Benefits:**
   - **Zero Cross-Contamination:** Eliminates hallucinations and incorrect citations from unrelated courses or projects.
   - **Performance & Efficiency:** Minimizes vector search space, reduces token footprint, and significantly speeds up local retrieval.
   - **Clean Mental Model:** Students, law practitioners, and accounting firms have clean, compartmentalized silos for each course or client engagement.
   - **Turnkey Packaging:** Exporting a workspace creates a self-contained `.zip` or on-demand PDF report containing only the relevant chats, notes, and milestones for that subject.
4. **Planned UI Integration Points:**
   - **Chat Topbar Workspace Switcher:** Quick indicator/dropdown in `/chat` showing the active workspace and allowing instant switching between project contexts.
   - **Document Library Workspace Filter:** Defaulting `/documents` view to the active workspace with a toggle to view "All Vault Documents".
   - **Workspace Custom Instructions:** Optional per-workspace system prompt overrides (e.g., *"In this Math workspace, always output proofs step-by-step using LaTeX notation"*).

---

## 8. Operational Guidelines for Future AI Assistants

1. **Maintain Minimalist Aesthetics:** Do not introduce large, cartoonish cards, vibrant gradient buttons, or heavy padding. Match the Notion / ElevenLabs high-density pattern.
2. **Preserve Domain Boundaries:** Under no circumstances edit or add files in `ca_frontend/` or `law_frontend/`. All active scope is strictly `frontend/` and `backend/`.
3. **No Dummy Placeholders:** Every new widget, toggle, or card must be wired to real backend endpoints or provide clean, graceful empty states.
4. **No `<voice_note>` Tags:** Do not use voice note tags in responses.
5. **Always Verify Typecheck:** Before completing frontend tasks, run `npx tsc --noEmit` inside `frontend/` to ensure zero TypeScript errors.
