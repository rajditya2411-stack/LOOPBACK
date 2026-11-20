# LoopBack – Chartered Accountant & Tax Advisory Frontend

> **Statutory Compliance, Financial Analysis & Audit Practice Hub**  
> *Port: `3020` · Next.js 16 (Turbopack) · Tailwind CSS*

---

## Overview

The **Chartered Accountant & Tax Advisory Frontend** is the specialized financial and audit vertical of the LoopBack platform. Engineered specifically for accounting firms, audit practitioners, and tax consultants, it streamlines statutory compliance tracking, financial ratio analysis under the Companies Act 2013, and audit verification workpapers.

---

## Core Capabilities

- **Statutory Compliance Pipeline**: Automated calendar tracking for GST returns (GSTR-1, GSTR-3B, GSTR-9), Income Tax filings (Form 3CD, ITR-6), Advance Tax instalments, and ROC MCA filings (AOC-4, MGT-7).
- **Schedule III Ratio Variance Engine**:
  - Automatically calculates the mandatory 11 statutory financial ratios prescribed by Companies Act 2013 Schedule III.
  - Flags any ratio with a variance exceeding the **25% statutory threshold**.
  - Generates auto-drafted explanatory disclosure notes for inclusion in audited financial statements.
- **Audit & Assurance Suite**:
  - *CARO 2020*: Comprehensive 21-clause verification checklist with standard audit tickmarks and risk ratings.
  - *Form 3CD*: High-scrutiny Tax Audit clauses (Clause 21(d) 40A(3) cash disallowances, Clause 26 43B/43B(h) MSME dues, Clause 34 TDS/TCS).
- **26AS / AIS Reconciliation**: Reconcile client Form 26AS, AIS, and TIS statements against books of accounts.
- **Client Portfolio Enclaves**: Multi-client workspace isolation, PBC (Provided by Client) tracking, and engagement management.

---

## Getting Started

### Prerequisites
- Node.js 20+
- LoopBack Core Backend running on `http://localhost:19000`

### Development Server
```bash
npm install
npm run dev # Starts on http://localhost:3020
```

### Production Build
```bash
npm run build
npm start # Starts production server on http://localhost:3020
```

---

## Route Map

| Route | Description |
| :--- | :--- |
| `/dashboard` | CA Practice Cockpit, statutory pipeline summary, and client dockets |
| `/compliance` | Multi-tier statutory compliance calendar (GST, IT, ROC, TDS) |
| `/financials` | Companies Act 2013 Schedule III 11-ratio matrix and variance note generator |
| `/audit` | CARO 2020 21-clause audit checklist and Form 3CD tax audit workpapers |
| `/reconciliation` | Form 26AS / AIS / TIS reconciliation engine and PBC tracker |
| `/advisory` | Income Tax and GST notice scrutiny copilot with reply drafting |
| `/clients` | Client portfolio directory and KYC management |
| `/workspaces` | Client audit files, working paper enclaves, and PDF packet generation |
| `/documents` | Audit evidence library, working papers, and statutory document vault |
| `/tasks` | Audit engagements, filing milestones, and review pipeline |
| `/chat` | Tax Advisory Copilot with Indian tax statutes and ICAI standards RAG |
| `/settings` | CA firm particulars, partner profiles, and AI provider configuration |
