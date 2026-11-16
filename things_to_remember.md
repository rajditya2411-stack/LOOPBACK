# Things to Remember & Pitfalls Catalogue

> **Crucial Guidance for Multi-Head Vertical Development (CA Head & Law Head)**  
> This document records every mistake, architecture trap, layout defect, database constraint mismatch, half-done button bug, and terminology leak encountered during the development of the CA Head, so that the **LAW Head** avoids repeating them.

---

## 1. Backend Server & Hot Reload Traps (Port 19000)

### ⚠️ The Uvicorn No-Reload Pitfall
- **The Issue**: `backend/run_dev.py` launches Uvicorn programmatically (`uvicorn.run("backend.app.main:app", host="127.0.0.1", port=19000)`) with **`reload=False`**.
- **What Happens**:
  - When you create new route handlers (`backend/app/api/ca.py` or future `backend/app/api/law.py`) and mount them in `backend/app/main.py`, the running python process **does not reload**.
  - Requests from the frontend throw **`Runtime ApiRequestError: Not Found (404)`** in the browser even though the code is saved on disk.
  - Zombie python processes frequently hold port 19000 in background Windows sessions.
- **Rule for LAW Head**:
  1. Whenever modifying backend routes, models, or services, **check listening processes on port 19000**:
     ```powershell
     Get-NetTCPConnection -LocalPort 19000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
     ```
  2. Restart the backend process:
     ```powershell
     Set-Location backend; & ".\.venv\Scripts\python.exe" run_dev.py
     ```
  3. Verify new endpoints with an authenticated test call or `curl` before assuming the frontend is broken.

---

## 2. SQLAlchemy Model Schema Constraints vs Frontend Assumptions

Before querying or creating database records in specialized endpoints (`/ca/...` or `/law/...`), **always inspect the SQLAlchemy model definitions in `backend/app/models/`**. Do not guess column names.

### ⚠️ Key Column Traps Encountered:
1. **`Task` model (`backend/app/models/task.py`)**:
   - **Has**: `id`, `user_id`, `parent_id`, `title`, `description`, `status`, `priority`, `due_date`, `is_recurring`, `recurrence_rule`, `position`, `created_at`, `updated_at`, `completed_at`.
   - **DOES NOT HAVE**: `goal_id`, `workspace_id`.
   - *Mistake*: Calling `Task(..., goal_id=goal.id, workspace_id=ws.id)` threw:
     `TypeError: 'goal_id' is an invalid keyword argument for Task`.
   - *Fix*: Embed matter/engagement identifiers in `Task.description` (e.g. `[Matter: #12345] Form 3CD Filing`) or associate through supported relationship tables.

2. **`Workspace` model (`backend/app/models/workspace.py`)**:
   - **Has**: `id`, `name`, `description`, `custom_instructions`, `owner_id`, `created_at`, `updated_at`.
   - **DOES NOT HAVE**: `is_active`.
   - *Mistake*: Querying `db.query(Workspace).order_by(Workspace.is_active.desc())` threw:
     `AttributeError: type object 'Workspace' has no attribute 'is_active'`.
   - *Fix*: The active workspace ID is stored on the `User` model as `user.active_workspace_id`. Query by `Workspace.owner_id == user.id` and order by `Workspace.created_at.desc()`.

3. **`Goal` model (`backend/app/models/goal.py`)**:
   - **Has**: `id`, `user_id`, `title`, `description`, `target_date`, `progress_percentage`, `status`, `created_at`, `updated_at`.
   - **DOES NOT HAVE**: `workspace_id`. Keep deliverables linked via user and descriptive titles.

---

## 3. Frontend Layout & Spacing: The "Flush Sidebar" Defect

### ⚠️ Zero-Spacing Padding Defect
- **The Issue**: In `layout.tsx`, the fixed sidebar has width `w-[240px]`. The main content area uses:
  ```tsx
  <main className="w-full lg:pl-[240px] pt-12 min-h-screen bg-surface">
  ```
- **The Trap**:
  - When porting or creating new pages, wrapping the page content in:
    `<div className="space-y-6 font-sans">` or `<div className="flex flex-col">` without horizontal padding causes the text and title headers to align at `x=240px`, **flush against the sidebar border with zero pixel margin**.
  - This was observed on `/compliance`, `/financials`, `/audit`, `/reconciliation`, `/advisory`, `/clients`, and `/documents/[id]`.
- **Mandatory Pattern for LAW Head**:
  - **Every single page root component** in `law_frontend` must start with generous horizontal and vertical padding:
    ```tsx
    export default function CaseMattersPage() {
      return (
        <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
          <div className="max-w-[1400px] mx-auto space-y-space-lg">
            {/* Page content */}
          </div>
        </div>
      );
    }
    ```
  - `px-space-lg sm:px-space-xl` ensures 16px to 24px of clear breathing room between the fixed sidebar and page content across all viewport widths.

---

## 4. Half-Done Buttons & Missing Event Handlers

### ⚠️ The Static Button Antipattern
- **The Issue**: Several UI buttons were rendered with rich styling, icons, and hover effects, but lacked `onClick` handlers or file inputs entirely:
  - `vault/page.tsx`: "Upload Working Paper" (no file picker input attached); "Inspect →" (no router push).
  - `reconciliation/page.tsx`: "Select Statement File" (no file handler); "+ Raise Audit Query" (no query creation modal); "Send Nudge →" (no status/feedback trigger).
- **Rule for LAW Head**:
  1. Every `<button>` tag that is not `type="submit"` **must have an explicit `onClick` handler**.
  2. Run an automated AST/regex verification script before declaring any page complete:
     ```js
     // Verify all buttons have either onClick or type="submit"
     const buttonRegex = /<button\b([^>]*)>/g;
     // Assert: /onClick=/i.test(attrs) || /type=['"]submit['"]/i.test(attrs)
     ```
  3. Action buttons (like file uploaders) must connect to real hidden `<input type="file" />` refs and handle file parsing or document creation.
  4. Inspection/detail buttons must navigate to the target route (`router.push('/cases/...')`).

---

## 5. UI Resilience: Missing Error Handlers & Fallbacks

### ⚠️ Uncaught Promise Rejection Crash
- **The Issue**: Calling `api.get(...)` inside `useEffect` without a `.catch(...)` handler caused unhandled promise rejections that crashed the Next.js client component when the backend was temporarily restarting (Screenshots 1 & 2: `Runtime ApiRequestError: Not Found`).
- **Rule for LAW Head**:
  1. Always chain `.catch((err) => ...)` on component mount fetch calls or wrap in `try/catch`.
  2. Provide fallback in-memory data structures (e.g. `DEFAULT_CARO_FALLBACK`, `DEFAULT_3CD_FALLBACK`, or standard legal clause sets).
  3. For critical calculation engines (such as ratio calculations or limitation period calculators), include client-side fallback math so the UI remains interactive and functional even during backend redeployments.

---

## 6. Vertical Terminology Transformation: Eradicating Student Leaks

When duplicating or adapting pages from the Student head (`frontend/`), **student terminologies hide in subtle places: modals, placeholders, badges, fallback mocks, and command palettes**.

### ⚠️ Student Terms vs CA Firm vs LAW Firm Lexicon Table

| Student Term (DO NOT USE) | CA Firm Term (Implemented) | LAW Firm Term (Required for Law Head) |
| :--- | :--- | :--- |
| **Course / Syllabus** | Practice Area / Engagement Portfolio | Legal Practice Area / Case Docket |
| **Workspace / Study Group** | Client Enclave (e.g. Apex Enterprises) | Matter / Case Enclave (e.g. *ABC Corp v. Union of India*) |
| **Lecture Note / Slides** | Audit Working Paper (PAF / CAF) | Case Brief / Pleading / Plaint / Written Statement |
| **Exam / Midterm Exam** | Statutory Audit / GSTR-9 Deliverable | Court Hearing / Limitation Date / Written Submission |
| **AI Study Companion** | CA Practice & Tax Advisory Copilot | Legal Counsel & Case Law Advisory Copilot |
| **Student Profile / Scholar** | CA Practice Particulars & Partner | Advocate Profile & Practice Particulars |
| **Roll ID** | ICAI Membership Number (MRN) | Bar Council Enrollment No (e.g. D/1234/2015) |
| **Academic Major / Degree** | Firm Registration Number (FRN) | High Court / Supreme Court Bar Association Standing |
| **Institution / College** | Firm Name & Registered Office | Chamber / Law Firm / Law Office Name |
| **Active-Recall / Flashcards** | Evidence Verification & Query Review | Precedent Verification & Cross-Examination Prep |
| **Pomodoro Focus Timer** | Practice Billing & Timesheet Timer | Billable Hours & Court Session Timer |
| **Study Guide (PDF Export)** | Audit Dossier & Compliance Memo | Case Law Briefing & Litigation Dossier |
| **CS & Math (Sidebar)** | FCA, Managing Partner | Senior Advocate / Managing Partner |
| **Math Tutor LaTeX Prompt** | Senior Audit Manager (SA 500/230) | Senior Counsel / Legal Research Analyst |

### ⚠️ Specific Hidden Traps Discovered & Cleared:
1. **Sidebar Hardcoded Meta**:
   - `sidebar.tsx` had hardcoded `CS & Math` under the practitioner's name. Changed to `FCA, Managing Partner`. For Law Head: `Senior Advocate, High Court`.
2. **Dossier / PDF Export Presets**:
   - `workspaces/page.tsx` had an active preset `study_guide` with prompt `"Create an exam-ready study guide synthesizing key concepts, formula derivations, and next steps."` and placeholder `"Physics 220 Exam Prep"`. Replaced with `audit_dossier` and `"Acme Global FY 2025-26 Statutory Audit"`.
3. **Workspace Persona Prompts**:
   - `documents/page.tsx` had `"Act as a patient math tutor. Always format equations using LaTeX"`. Replaced with `"Act as a senior audit manager. Cite relevant ICAI auditing standards (SA 500/SA 230), check CARO 2020 clause applicability"`.
4. **Kanban Card Buttons**:
   - `tasks/page.tsx` had `✦ Study` button in every single column of the Kanban board, and `Load Sample Syllabus` in the empty state. Replaced with `✦ Advisory` and `Load Sample Engagements`.
5. **Confirmation Dialogs**:
   - `tasks/page.tsx` had `confirm("Delete this academic milestone?")` and `confirm("Delete this study task?")`. Replaced with `confirm("Delete this statutory deliverable milestone?")` and `confirm("Delete this compliance deliverable task?")`.
6. **Redirect Fallback Pages**:
   - `goals/page.tsx`, `memory/page.tsx`, `profile/page.tsx` had "Redirecting to Milestones & Execution Board...", "Knowledge & Memory", "Settings & Profile". Replaced with CA firm terms.

---

## 7. Navigation & Top-Bar Header Synchronization

- **Header Page Title Mapping**: In `layout.tsx`, `getPageTitle(pathname)` dynamically maps URL routes to page titles displayed in the top header.
- **Rule for LAW Head**:
  - When creating new routes (`/litigation`, `/briefs`, `/contracts`, `/arbitration`, `/calendar`, `/precedents`), **immediately update `getPageTitle` in `layout.tsx`**.
  - Otherwise, users see a generic or blank header title.
- **Active Client/Matter Scope**:
  - Always surface the currently active matter or client enclave in the top navigation bar or sub-rail so practitioners know which client file is loaded.

---

## 8. Multi-Head Isolation & Port Matrix

| Head / Application | Directory | Port | Backend Target | Rules |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API** | `backend/` | `19000` | SQLite `data/loopback.db` | All routes namespaced (`/api/ca/...`, `/api/law/...`) |
| **Student Head** | `frontend/` | `3000` | `http://localhost:19000` | **DO NOT TOUCH** during vertical work |
| **CA Head** | `ca_frontend/` | `3020` | `http://localhost:19000` | Independent port, CA branding |
| **LAW Head** | `law_frontend/` | `3030` | `http://localhost:19000` | Independent port, Legal branding |

---

## 9. Verification Checklist Before Calling Done

Before finishing any vertical head, execute the following commands without error:
- [ ] `npx tsc --noEmit` in the vertical frontend directory (0 TypeScript errors).
- [ ] `npm run build` in the vertical frontend directory (all static and dynamic routes compile cleanly).
- [ ] `Get-NetTCPConnection -LocalPort 19000` verifies backend is running.
- [ ] API endpoints respond with HTTP 200 to real requests with valid auth headers.
- [ ] Content padding is verified: zero elements flush against sidebar border (`px-space-lg sm:px-space-xl`).
- [ ] All student terms purged across all pages, modals, tooltips, and command palette.
- [ ] All `<button>` elements have functional `onClick` handlers or `type="submit"`.
