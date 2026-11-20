# LoopBack – Core Backend Service

> **High-Performance FastAPI Core, Domain Routers & Local Storage Engine**  
> *Port: `19000` · Python 3.11+ · SQLAlchemy · Alembic · ChromaDB*

---

## Overview

The **LoopBack Core Backend** is the foundational service powering all three LoopBack frontend verticals. It provides authentication, local vector search, encrypted SQLite storage, and multi-provider AI orchestration with zero cloud data leakage.

---

## Architecture Highlights

- **FastAPI Gateway**: Asynchronous REST endpoints, Server-Sent Events (SSE) for token streaming, and Argon2id session security.
- **Unified Domain Routers**:
  - `/api/auth` & `/api/users`: Argon2id password hashing, JWT tokens, CSRF protection.
  - `/api/chat`: Multi-turn conversational streaming with memory context injection.
  - `/api/documents`: Multi-modal document extraction (PDF, TXT, MD, image OCR) and chunking.
  - `/api/ca`: Chartered Accountant domain endpoints (CARO 2020, Form 3CD, Schedule III ratios, compliance calendars).
  - `/api/law`: Legal practice domain endpoints (Limitation Act 1963 calculation, Section 18 tolling, Cause List tracker, Case Precedents).
  - `/api/workspaces`: Multi-matter enclave partitioning, resource sharing, and export.
- **ChromaDB Vector Store**: On-device vector embeddings for semantic document retrieval and active recall evaluation.
- **ProviderManager (BYOK)**: Connects directly to OpenAI, Anthropic Claude, Google Gemini, xAI Grok, and Kimi using the user's private API keys.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Virtual environment (`backend/.venv`)

### Setup & Run
```powershell
# Create virtual environment and install dependencies
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Run migrations
.\.venv\Scripts\alembic.exe upgrade head

# Start development server on port 19000
.\.venv\Scripts\python.exe run_dev.py
```

### Running Tests
```powershell
.\.venv\Scripts\pytest.exe -o pythonpath=. tests/ -q
```
All 71 tests across Core, CA, and Law domains should pass.
