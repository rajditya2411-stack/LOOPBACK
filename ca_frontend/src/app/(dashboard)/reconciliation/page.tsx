"use client";

import { useState, useRef, ChangeEvent } from "react";

interface ReconItem {
  id: string;
  tan: string;
  deductor: string;
  section: string;
  gross_books: number;
  gross_26as: number;
  tds_books: number;
  tds_26as: number;
  difference: number;
  status: "MATCHED" | "MISMATCHED" | "MISSING_IN_BOOKS" | "MISSING_IN_26AS";
}

const SAMPLE_RECON: ReconItem[] = [
  {
    id: "rec-1",
    tan: "DELM12345F",
    deductor: "Infosys Technologies Ltd",
    section: "194J (Professional)",
    gross_books: 1250000,
    gross_26as: 1250000,
    tds_books: 125000,
    tds_26as: 125000,
    difference: 0,
    status: "MATCHED",
  },
  {
    id: "rec-2",
    tan: "MUMB98765A",
    deductor: "Tata Consultancy Services Ltd",
    section: "194C (Contractor)",
    gross_books: 850000,
    gross_26as: 920000,
    tds_books: 17000,
    tds_26as: 18400,
    difference: 1400,
    status: "MISMATCHED",
  },
  {
    id: "rec-3",
    tan: "BLRK45678B",
    deductor: "HDFC Bank Ltd",
    section: "194A (Interest)",
    gross_books: 42000,
    gross_26as: 42000,
    tds_books: 4200,
    tds_26as: 4200,
    difference: 0,
    status: "MATCHED",
  },
  {
    id: "rec-4",
    tan: "HYDW33211C",
    deductor: "Wipro Enterprises Pvt Ltd",
    section: "194Q (Goods Purchase)",
    gross_books: 6500000,
    gross_26as: 6500000,
    tds_books: 6500,
    tds_26as: 0,
    difference: 6500,
    status: "MISSING_IN_26AS",
  },
];

interface PbcQuery {
  id: string;
  item: string;
  lead_schedule: string;
  status: "Pending Client" | "Received & Verified" | "Overdue";
  requested_date: string;
  client_contact: string;
}

const SAMPLE_PBC: PbcQuery[] = [
  {
    id: "pbc-1",
    item: "Direct Bank Confirmation Certificate for Axis Bank CC Account #9021",
    lead_schedule: "B-1 Bank Balances",
    status: "Pending Client",
    requested_date: "01 Mar 2026",
    client_contact: "CFO (cfo@apex.in)",
  },
  {
    id: "pbc-2",
    item: "MSME Registration Certificates (Udyam) for Top 20 Trade Creditors",
    lead_schedule: "E-1 Section 43B(h)",
    status: "Overdue",
    requested_date: "24 Feb 2026",
    client_contact: "Accounts Head",
  },
  {
    id: "pbc-3",
    item: "Title deeds & encumbrance certificates for Pune Manufacturing Plant",
    lead_schedule: "D-1 CARO Clause (i)",
    status: "Received & Verified",
    requested_date: "15 Feb 2026",
    client_contact: "Company Secretary",
  },
];

export default function ReconciliationPage() {
  const [activeTab, setActiveTab] = useState<"26as" | "bank" | "pbc">("26as");
  const [filter, setFilter] = useState<"ALL" | "MISMATCHED">("ALL");

  // Bank voucherization state
  const bankFileInputRef = useRef<HTMLInputElement>(null);
  const [bankUploadMsg, setBankUploadMsg] = useState<string | null>(null);

  // PBC Query state
  const [pbcList, setPbcList] = useState<PbcQuery[]>(SAMPLE_PBC);
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [newQueryItem, setNewQueryItem] = useState("");
  const [newQuerySchedule, setNewQuerySchedule] = useState("B-1 Bank Balances");
  const [newQueryContact, setNewQueryContact] = useState("cfo@client.in");
  const [nudgedQueries, setNudgedQueries] = useState<Record<string, boolean>>({});
  const [nudgeNotice, setNudgeNotice] = useState<string | null>(null);

  const filteredRecon = SAMPLE_RECON.filter(
    (item) => filter === "ALL" || item.status !== "MATCHED"
  );

  const handleBankFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBankUploadMsg(`Bank statement "${file.name}" uploaded & parsed. 3 high-volume transactions auto-vouchered.`);
    setTimeout(() => setBankUploadMsg(null), 4500);
    if (bankFileInputRef.current) bankFileInputRef.current.value = "";
  };

  const handleRaiseQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQueryItem.trim()) return;
    const newQuery: PbcQuery = {
      id: `pbc-${Date.now()}`,
      item: newQueryItem.trim(),
      lead_schedule: newQuerySchedule,
      status: "Pending Client",
      requested_date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      client_contact: newQueryContact.trim() || "Finance Controller",
    };
    setPbcList([newQuery, ...pbcList]);
    setNewQueryItem("");
    setShowQueryModal(false);
    setNudgeNotice(`Audit Query created and queued for client dispatch.`);
    setTimeout(() => setNudgeNotice(null), 3500);
  };

  const handleSendNudge = (id: string, contact: string) => {
    setNudgedQueries((prev) => ({ ...prev, [id]: true }));
    setNudgeNotice(`Nudge reminder dispatched via portal to ${contact}.`);
    setTimeout(() => setNudgeNotice(null), 3500);
  };

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <input
        type="file"
        ref={bankFileInputRef}
        onChange={handleBankFileUpload}
        className="hidden"
        accept=".pdf,.csv,.xlsx,.xls,.txt"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-semibold text-on-surface">
            Reconciliation &amp; Client PBC Center
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            26AS / AIS / TIS vs Books cross-matching, bank statement voucherization, and audit query tracking.
          </p>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-high border border-outline-variant/30 text-xs">
          <button
            onClick={() => setActiveTab("26as")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "26as"
                ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            26AS / AIS Matrix
          </button>
          <button
            onClick={() => setActiveTab("bank")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "bank"
                ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Bank Voucherization
          </button>
          <button
            onClick={() => setActiveTab("pbc")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "pbc"
                ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Client Queries (PBC)
          </button>
        </div>
      </div>

      {nudgeNotice && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          <span>{nudgeNotice}</span>
        </div>
      )}

      {/* TAB 1: 26AS Cross-Reconciliation */}
      {activeTab === "26as" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter("ALL")}
                className={`px-2.5 py-1 rounded font-mono text-[11px] cursor-pointer ${
                  filter === "ALL"
                    ? "bg-on-surface text-surface font-semibold"
                    : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                All Entries ({SAMPLE_RECON.length})
              </button>
              <button
                onClick={() => setFilter("MISMATCHED")}
                className={`px-2.5 py-1 rounded font-mono text-[11px] cursor-pointer ${
                  filter === "MISMATCHED"
                    ? "bg-rose-600 text-white font-semibold"
                    : "bg-surface-container-low text-rose-600"
                }`}
              >
                Discrepancies Only (2)
              </button>
            </div>

            <span className="text-[11px] font-mono text-outline">
              Cross-checked with TRACES Part A &amp; AIS
            </span>
          </div>

          <div className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-high/40 text-on-surface-variant text-[11px] font-mono uppercase border-b border-outline-variant/20">
                <tr>
                  <th className="py-2.5 px-3">Deductor &amp; TAN</th>
                  <th className="py-2.5 px-3">Section</th>
                  <th className="py-2.5 px-3 text-right">Gross (Books)</th>
                  <th className="py-2.5 px-3 text-right">Gross (26AS)</th>
                  <th className="py-2.5 px-3 text-right">TDS (Books)</th>
                  <th className="py-2.5 px-3 text-right">TDS (26AS)</th>
                  <th className="py-2.5 px-3 text-right">Variance (₹)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredRecon.map((row) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-surface-container-low/50 transition-colors ${
                      row.status !== "MATCHED" ? "bg-rose-500/5" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-on-surface">{row.deductor}</div>
                      <div className="font-mono text-[10px] text-outline">{row.tan}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface-variant">
                      {row.section}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      ₹{row.gross_books.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      ₹{row.gross_26as.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium">
                      ₹{row.tds_books.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium">
                      ₹{row.tds_26as.toLocaleString()}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-semibold ${
                        row.difference > 0 ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      ₹{row.difference.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold ${
                          row.status === "MATCHED"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Bank Statement Voucherization */}
      {activeTab === "bank" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-surface-container-lowest border border-dashed border-outline-variant/60 text-center">
            <span className="material-symbols-outlined text-[32px] text-primary mb-1">upload_file</span>
            <h3 className="text-xs font-semibold text-on-surface">Upload Client Bank Statement (PDF / CSV)</h3>
            <p className="text-[11px] text-on-surface-variant mt-0.5 max-w-sm mx-auto">
              Extracts high-volume transactions, categorizes UPI/NEFT counterparties, and identifies statutory tax challan payments.
            </p>
            <button
              onClick={() => bankFileInputRef.current?.click()}
              className="mt-3 px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-xs font-medium border border-outline-variant/30 text-on-surface transition-colors cursor-pointer shadow-xs"
            >
              Select Statement File
            </button>
            {bankUploadMsg && (
              <p className="text-xs font-mono text-emerald-600 font-medium mt-2">
                ✓ {bankUploadMsg}
              </p>
            )}
          </div>

          <div className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30">
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface block mb-3">
              Automated Transaction Classification Preview
            </span>
            <div className="space-y-2 text-xs">
              {[
                { date: "28 Feb 2026", desc: "GST PMT-06 CHALLAN AXISB0019234", amount: "₹ 1,48,200 (Dr)", category: "Statutory Dues (GST)", status: "Auto-Vouchered" },
                { date: "27 Feb 2026", desc: "NEFT INFY SERVICES LTD INVOICE 481", amount: "₹ 11,25,000 (Cr)", category: "Trade Receivables", status: "TDS 194J Matched" },
                { date: "25 Feb 2026", desc: "CASH WITHDRAWAL SELF AT BR 041", amount: "₹ 85,000 (Dr)", category: "Cash In Hand", status: "Section 40A(3) Flagged" },
              ].map((tx, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-surface-container-low border border-outline-variant/25 flex items-center justify-between"
                >
                  <div>
                    <div className="font-mono text-[10px] text-outline">{tx.date}</div>
                    <div className="font-medium text-on-surface mt-0.5">{tx.desc}</div>
                    <span className="font-mono text-[10px] text-primary">{tx.category}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs font-semibold text-on-surface block">
                      {tx.amount}
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Client PBC Tracker */}
      {activeTab === "pbc" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface">
              Active Audit Queries &amp; Provided by Client (PBC) Requests
            </span>
            <button
              onClick={() => setShowQueryModal(true)}
              className="px-2.5 py-1 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 cursor-pointer shadow-xs"
            >
              + Raise Audit Query
            </button>
          </div>

          <div className="space-y-2.5">
            {pbcList.map((pbc) => (
              <div
                key={pbc.id}
                className="p-3.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-between gap-4 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-medium">
                      {pbc.lead_schedule}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold ${
                        pbc.status === "Overdue"
                          ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                          : pbc.status === "Pending Client"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {pbc.status}
                    </span>
                  </div>
                  <h3 className="font-medium text-on-surface mt-1.5">{pbc.item}</h3>
                  <div className="font-mono text-[10px] text-outline mt-1">
                    Requested on {pbc.requested_date} · Contact: {pbc.client_contact}
                  </div>
                </div>

                <button
                  onClick={() => handleSendNudge(pbc.id, pbc.client_contact)}
                  disabled={nudgedQueries[pbc.id]}
                  className="text-xs font-mono text-primary hover:underline shrink-0 cursor-pointer disabled:text-secondary disabled:no-underline"
                >
                  {nudgedQueries[pbc.id] ? "✓ Nudge Sent" : "Send Nudge →"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raise Audit Query Modal */}
      {showQueryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl max-w-md w-full flex flex-col gap-space-md border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                Raise Client Audit Query (PBC)
              </h3>
              <button
                onClick={() => setShowQueryModal(false)}
                className="p-1 text-secondary hover:text-on-surface rounded cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleRaiseQuery} className="flex flex-col gap-space-sm text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-label-sm text-secondary">
                  Evidence / Query Particulars *
                </label>
                <textarea
                  required
                  rows={2}
                  value={newQueryItem}
                  onChange={(e) => setNewQueryItem(e.target.value)}
                  placeholder="e.g. Bank confirmation certificate for foreign currency EEFC account..."
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Lead Schedule
                  </label>
                  <select
                    value={newQuerySchedule}
                    onChange={(e) => setNewQuerySchedule(e.target.value)}
                    className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm outline-none border border-outline-variant/30"
                  >
                    <option value="A-1 Capital Accounts">A-1 Capital Accounts</option>
                    <option value="B-1 Bank Balances">B-1 Bank Balances</option>
                    <option value="C-1 Trade Receivables">C-1 Trade Receivables</option>
                    <option value="D-1 CARO PPE">D-1 CARO PPE</option>
                    <option value="E-1 Section 43B(h)">E-1 Section 43B(h)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Client Recipient
                  </label>
                  <input
                    type="text"
                    value={newQueryContact}
                    onChange={(e) => setNewQueryContact(e.target.value)}
                    placeholder="cfo@client.in"
                    className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm outline-none border border-outline-variant/30"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQueryModal(false)}
                  className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-on-surface text-surface hover:opacity-90 font-label-md text-label-md shadow-sm cursor-pointer"
                >
                  Dispatch Query
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
