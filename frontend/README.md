# LoopBack – Student & Academic Frontend

> **Academic Productivity, Active Recall & Knowledge Studio**  
> *Port: `3010` · Next.js 16 (Turbopack) · Tailwind CSS*

---

## Overview

The **Student & Academic Frontend** is the specialized educational and research head of the LoopBack platform. It provides a private, distraction-free environment for students, researchers, and lifelong learners to ingest complex study materials, conduct active recall sessions, and interact with a contextual AI study copilot.

---

## Core Capabilities

- **Active Recall Knowledge Studio**: Ingest PDFs, Markdown notes, lecture slides, and text documents. Explain concepts in your own words and receive AI-driven evaluations of comprehension, missing concepts, and misconceptions.
- **Dual Memory Architecture**:
  - *Working Memory*: Active task contexts and current focus areas.
  - *Episodic / Semantic Memory*: Long-term knowledge profile tracking mastery scores, strengths, and spaced revision intervals.
- **Workspace-Scoped RAG**: Partition study documents into discrete course enclaves with selective ZIP export and on-demand PDF compilation.
- **Academic Cockpit**: Daily study planner, goal milestones, streak counters, and learning analytics.

---

## Getting Started

### Prerequisites
- Node.js 20+
- LoopBack Core Backend running on `http://localhost:19000`

### Development Server
```bash
npm install
npm run dev # Starts on http://localhost:3010
```

### Production Build
```bash
npm run build
npm start # Starts production server on http://localhost:3010
```

---

## Route Map

| Route | Description |
| :--- | :--- |
| `/dashboard` | Academic cockpit with study milestones, daily focus, and recent materials |
| `/documents` | Document library, file upload, and active recall study sessions |
| `/documents/[id]` | Document reader, study interface, and comprehension feedback |
| `/chat` | AI Study Copilot with streaming responses and workspace-aware RAG |
| `/tasks` | Course assignments, milestones, and spaced repetition deadlines |
| `/workspaces` | Course and project enclaves with selective resource bundling and export |
| `/memory` | Knowledge profile, semantic memories, and mastery review pipeline |
| `/analytics` | Study time analytics, mastery curves, and revision metrics |
| `/settings` | AI provider configuration, student profile, and system preferences |
