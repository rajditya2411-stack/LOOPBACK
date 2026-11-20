# LoopBack – Law Chambers & Litigation Practice Frontend

> **Legal Practice Management, Limitation Engine & Litigation Cockpit**  
> *Port: `3030` · Next.js 16 (Turbopack) · Tailwind CSS*

---

## Overview

The **Law Chambers & Litigation Practice Frontend** is the specialized legal vertical of the LoopBack platform. Designed for advocates, law firms, and legal chambers, it manages case dockets, calculates statutory limitation periods under Indian law, monitors daily court cause lists, and references landmark precedents with full local privacy.

---

## Core Capabilities

- **Limitation Period Calculator**:
  - Implements the **Limitation Act, 1963** across key schedules (Articles 14, 54, 55, 65, 116, 137).
  - Enforces **Section 18 tolling**: Validates written acknowledgment of liability, ensuring acknowledgment occurred *prior* to limitation expiry (*Sampuran Singh v. Niranjan Kaur*).
  - Enforces **Section 5 condonation rules**: Distinguishes original suits (where delay cannot be condoned) from appeals/applications.
  - Commercial Courts Act, 2015: Mandates the 120-day absolute ceiling for Written Statements under Order VIII Rule 1 CPC (*SCG Contracts*).
- **Daily Court Cause List Tracker**:
  - Live tracking of scheduled hearings across the Supreme Court of India, High Courts, Commercial Courts, and Tribunals (NCLT, NCLAT, ITAT, DRT).
  - Tracks courtroom numbers, item numbers, stages of proceeding (Admission, Framing of Issues, Final Arguments), and presiding benches.
- **Landmark Case Precedents Repository**:
  - Searchable landmark jurisprudence repository indexed by court, citation, bench ratio, and statutory articles.
  - Matches case facts and legal propositions against binding Supreme Court precedents.
- **Case Matter Enclaves**: Matter-specific dockets, pleading drafts, briefs, and client confidential files with zero cloud leakage.

---

## Getting Started

### Prerequisites
- Node.js 20+
- LoopBack Core Backend running on `http://localhost:19000`

### Development Server
```bash
npm install
npm run dev # Starts on http://localhost:3030
```

### Production Build
```bash
npm run build
npm start # Starts production server on http://localhost:3030
```

---

## Route Map

| Route | Description |
| :--- | :--- |
| `/dashboard` | Litigation chambers cockpit, daily hearings count, and active matters |
| `/limitation` | Limitation Act 1963 statutory calculator and Section 18 tolling engine |
| `/causelist` | Supreme Court, High Court, and Tribunal daily cause list tracker |
| `/precedents` | Landmark judgments, citation index, headnotes, and proposition matcher |
| `/workspaces` | Case matter enclaves, brief binders, and client records |
| `/documents` | Pleadings, affidavits, applications, and legal evidence vault |
| `/tasks` | Court hearings, filing deadlines, and procedural litigation schedules |
| `/chat` | Legal Advisory Copilot and jurisprudence assistant |
| `/settings` | Advocate bar profile, chamber settings, and AI provider configuration |
