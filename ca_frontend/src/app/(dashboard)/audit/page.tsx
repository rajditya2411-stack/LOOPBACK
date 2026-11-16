"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface CaroClause {
  id: string;
  clause: string;
  title: string;
  category: string;
  description: string;
  risk_level: string;
}

interface Form3CDClause {
  id: string;
  clause: string;
  title: string;
  description: string;
  category: string;
}

const DEFAULT_CARO_FALLBACK: CaroClause[] = [
  {
    id: "caro-1",
    clause: "(i)",
    title: "Property, Plant & Equipment and Intangible Assets",
    category: "Fixed Assets",
    description: "Maintenance of proper records showing full particulars, quantitative details and situation of PPE; physical verification by management at reasonable intervals; title deeds of immovable property held in company's name.",
    risk_level: "Medium",
  },
  {
    id: "caro-2",
    clause: "(ii)",
    title: "Inventory & Working Capital Limits",
    category: "Working Capital",
    description: "Physical verification of inventory at reasonable intervals; coverage and procedures; discrepancies > 10% in aggregate; sanction of working capital limits > Rs. 5 crore on security of current assets and quarterly return reconciliations.",
    risk_level: "High",
  },
  {
    id: "caro-7",
    clause: "(vii)",
    title: "Statutory Dues & Undisputed Liabilities",
    category: "Statutory Dues",
    description: "Regularity in depositing undisputed statutory dues (GST, PF, ESI, Income-tax, Customs, Cess); arrears outstanding > 6 months from date they became payable; disputed dues forum and amount.",
    risk_level: "Critical",
  },
  {
    id: "caro-11",
    clause: "(xi)",
    title: "Fraud Reporting & Whistle-Blower Complaints",
    category: "Fraud & Ethics",
    description: "Any fraud by the company or any fraud on the company noticed or reported during the year; report under section 143(12) filed in Form ADT-4; consideration of whistle-blower complaints.",
    risk_level: "Critical",
  },
];

const DEFAULT_3CD_FALLBACK: Form3CDClause[] = [
  {
    id: "3cd-21d",
    clause: "Clause 21(d)",
    title: "Section 40A(3) Cash Payment Disallowance",
    category: "Disallowances",
    description: "Expenditure incurred in respect of which payment is made otherwise than by account payee cheque/draft exceeding Rs. 10,000.",
  },
  {
    id: "3cd-26",
    clause: "Clause 26",
    title: "Section 43B & 43B(h) Statutory and MSME Dues",
    category: "Statutory Dues",
    description: "Liability for statutory dues outstanding as on balance sheet date and payments made to Micro & Small enterprises beyond 45 days.",
  },
  {
    id: "3cd-34",
    clause: "Clause 34",
    title: "Chapter XVII-B Compliance (TDS/TCS Audit)",
    category: "TDS / TCS",
    description: "Verification of tax deducted, deposited within prescribed time limit, and filed in quarterly returns (Form 24Q/26Q/27Q).",
  },
];

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState<"caro" | "form3cd" | "leads">("caro");
  const [caroList, setCaroList] = useState<CaroClause[]>(DEFAULT_CARO_FALLBACK);
  const [form3cdList, setForm3cdList] = useState<Form3CDClause[]>(DEFAULT_3CD_FALLBACK);
  const [clauseStatus, setClauseStatus] = useState<Record<string, string>>({});
  const [clauseNotes, setClauseNotes] = useState<Record<string, string>>({});
  const [selectedTickmark, setSelectedTickmark] = useState<string>("√");
  const [copiedMsg, setCopiedMsg] = useState(false);

  useEffect(() => {
    void api.get<CaroClause[]>("/ca/checklists/caro2020")
      .then((data) => { if (Array.isArray(data) && data.length > 0) setCaroList(data); })
      .catch((err) => console.warn("Using offline CARO checklist:", err));
    void api.get<Form3CDClause[]>("/ca/checklists/form3cd")
      .then((data) => { if (Array.isArray(data) && data.length > 0) setForm3cdList(data); })
      .catch((err) => console.warn("Using offline Form 3CD checklist:", err));
  }, []);

  const handleStatusChange = (id: string, status: string) => {
    setClauseStatus((prev) => ({ ...prev, [id]: status }));
  };

  const handleNoteChange = (id: string, note: string) => {
    setClauseNotes((prev) => ({ ...prev, [id]: note }));
  };

  const copyDraftReport = () => {
    const adverse = caroList
      .filter((c) => clauseStatus[c.id] === "Adverse")
      .map((c) => `${c.clause} ${c.title}: Adverse remark noted - ${clauseNotes[c.id] || "Pending clarification."}`)
      .join("\n\n");

    const text = adverse || "All 21 CARO 2020 clauses verified. No adverse remarks or qualifications noted for the reporting period.";
    navigator.clipboard.writeText(text);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 3000);
  };

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-semibold text-on-surface">
            Audit &amp; Assurance Workpapers (SA 230)
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            ICAI Standards on Auditing compliant lead schedules, CARO 2020 (21 clauses), and Tax Audit Form 3CD.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Audit Tickmark Toolbar */}
          <div className="flex items-center gap-1 p-1 rounded bg-surface-container-high border border-outline-variant/30 text-xs">
            <span className="text-[10px] font-mono uppercase text-outline px-1.5">Tick:</span>
            {[
              { symbol: "√", title: "Vouched to Invoice" },
              { symbol: "^", title: "Footed / Casted" },
              { symbol: "§", title: "Verified with Register" },
              { symbol: "©", title: "Bank Confirmation Received" },
            ].map((t) => (
              <button
                key={t.symbol}
                onClick={() => setSelectedTickmark(t.symbol)}
                className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs ${
                  selectedTickmark === t.symbol
                    ? "bg-primary text-white shadow-xs"
                    : "hover:bg-surface-container text-on-surface"
                }`}
                title={t.title}
              >
                {t.symbol}
              </button>
            ))}
          </div>

          <button
            onClick={copyDraftReport}
            className="px-3 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">content_copy</span>
            <span>{copiedMsg ? "Copied to Clipboard!" : "Export CARO Text"}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-outline-variant/20 pb-1 text-xs">
        <button
          onClick={() => setActiveTab("caro")}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === "caro"
              ? "bg-primary text-white font-semibold"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          CARO 2020 Checklist (21 Clauses)
        </button>
        <button
          onClick={() => setActiveTab("form3cd")}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === "form3cd"
              ? "bg-primary text-white font-semibold"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          Tax Audit Form 3CD Workbench
        </button>
        <button
          onClick={() => setActiveTab("leads")}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeTab === "leads"
              ? "bg-primary text-white font-semibold"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
          }`}
        >
          Lead Schedules (A-1 to E-1)
        </button>
      </div>

      {/* TAB 1: CARO 2020 */}
      {activeTab === "caro" && (
        <div className="space-y-3">
          {caroList.map((item) => {
            const status = clauseStatus[item.id] || "Clean";
            return (
              <div
                key={item.id}
                className={`p-4 rounded-lg bg-surface-container-lowest border transition-all ${
                  status === "Adverse"
                    ? "border-rose-500/50 bg-rose-500/5"
                    : status === "Observation"
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-outline-variant/30"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                      Clause {item.clause}
                    </span>
                    <h3 className="text-xs font-semibold text-on-surface">{item.title}</h3>
                    <span className="font-mono text-[10px] text-outline px-1.5 py-0.5 rounded bg-surface-container">
                      {item.category}
                    </span>
                  </div>

                  {/* Status Pills */}
                  <div className="flex items-center gap-1 text-xs">
                    {["Clean", "Observation", "Adverse", "N/A"].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(item.id, s)}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] transition-colors ${
                          status === s
                            ? s === "Adverse"
                              ? "bg-rose-600 text-white font-bold"
                              : s === "Observation"
                              ? "bg-amber-600 text-white font-bold"
                              : s === "Clean"
                              ? "bg-emerald-600 text-white font-bold"
                              : "bg-outline text-white font-bold"
                            : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                  {item.description}
                </p>

                {/* Audit Evidence & Notes Box */}
                <div className="mt-3 pt-2.5 border-t border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <span className="font-mono text-[10px] text-outline shrink-0">
                    Audit Verification Memo:
                  </span>
                  <input
                    type="text"
                    value={clauseNotes[item.id] || ""}
                    onChange={(e) => handleNoteChange(item.id, e.target.value)}
                    placeholder="Enter sampling sample reference (e.g. Vouched with Asset Register FAR-2026, physically verified)..."
                    className="flex-1 w-full px-2.5 py-1 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-hidden"
                  />
                  <span className="text-[11px] font-mono text-emerald-600 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10">
                    Tick: {selectedTickmark}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: Form 3CD Workbench */}
      {activeTab === "form3cd" && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-lg bg-surface-container-high border border-outline-variant/40 text-xs">
            <span className="font-semibold text-primary block mb-0.5">
              Section 44AB Tax Audit Disallowance Radar:
            </span>
            <span>
              Special verification required for Section 43B(h) MSME payments (45-day cutoff), Section 40A(3) cash payments exceeding ₹10,000, and Section 40(a)(ia) 30% TDS disallowance.
            </span>
          </div>

          {form3cdList.map((clause) => (
            <div
              key={clause.id}
              className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-amber-600 px-2 py-0.5 rounded bg-amber-500/10">
                    {clause.clause}
                  </span>
                  <h3 className="text-xs font-semibold text-on-surface">{clause.title}</h3>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                  {clause.category}
                </span>
              </div>

              <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                {clause.description}
              </p>

              <div className="mt-3 pt-2.5 border-t border-outline-variant/20 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="font-mono text-[10px] text-outline block mb-1">
                    Auditor Finding / Disallowance Amount (₹):
                  </span>
                  <input
                    type="text"
                    defaultValue="0.00"
                    className="w-full px-2.5 py-1 text-xs font-mono rounded border border-outline-variant/30 bg-surface-container-low"
                  />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-outline block mb-1">
                    Annexure Reference:
                  </span>
                  <input
                    type="text"
                    defaultValue="Annexure 3CD-A (Ledger Scrubbing)"
                    className="w-full px-2.5 py-1 text-xs font-mono rounded border border-outline-variant/30 bg-surface-container-low"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Lead Schedules (A-1 to E-1) */}
      {activeTab === "leads" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              code: "A-1",
              title: "Balance Sheet & Capital Accounts",
              items: ["Share capital ledger vs MCA filings", "Reserves & Surplus movement", "Partner drawing accounts"],
            },
            {
              code: "B-1",
              title: "Bank & Cash Verification",
              items: ["Bank reconciliation statements (BRS)", "Direct 3rd-party bank confirmations", "Cash in hand physical certificate"],
            },
            {
              code: "C-1",
              title: "Trade Receivables Aging (Schedule III)",
              items: ["Undisputed dues < 6 months", "Disputed debts & provision for ECL", "Balance confirmations sampling"],
            },
            {
              code: "D-1",
              title: "Fixed Assets & Depreciation Matrix",
              items: ["Income Tax Block rates vs Companies Act useful life", "Additions > ₹10k voucher checking", "Physical verification register"],
            },
            {
              code: "E-1",
              title: "Trade Payables & MSME Compliance",
              items: ["MSME Udyam verification portal check", "Section 43B(h) 45-day overdue schedule", "TDS deduction compliance on expenses"],
            },
          ].map((lead) => (
            <div
              key={lead.code}
              className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                  Lead {lead.code}
                </span>
                <h3 className="text-xs font-semibold text-on-surface">{lead.title}</h3>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-on-surface-variant">
                {lead.items.map((it, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">
                      {selectedTickmark}
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
