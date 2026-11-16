"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useClientStore } from "@/store/client-store";

interface NoticeAnalysis {
  din: string | null;
  section_invoked: string;
  financial_year: string;
  issuing_authority: string;
  demand_amount: number | null;
  response_deadline_days: number;
  summary_of_impugned_matter: string;
  key_legal_defenses: string[];
  suggested_reply_outline: string[];
}

export default function AdvisoryPage() {
  const { activeClient } = useClientStore();
  const [activeTab, setActiveTab] = useState<"notice" | "chat">("notice");
  const [noticeText, setNoticeText] = useState(
    "Notice under Section 143(2) of Income Tax Act with DIN: ITBA/AST/S/143(2)/2025-26/1059483921(1). Discrepancy observed between reported turnover in ITR and outward taxable supply in GSTR-9 with addition proposed under Section 68 for ₹14,82,000."
  );
  const [analysis, setAnalysis] = useState<NoticeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);

  // Advisory Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: "Welcome to LoopBack CA Advisory Copilot. Grounded in Income Tax Act 1961, CGST Act 2017, and ICAI auditing standards. You are currently consulting for enclave: " +
        (activeClient ? activeClient.name : "TechCorp Solutions Pvt Ltd") +
        ". What statutory query or assessment notice would you like to review?",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  const handleAnalyzeNotice = async () => {
    if (!noticeText.trim()) return;
    setLoading(true);
    try {
      const res = await api.post<NoticeAnalysis>("/ca/notices/analyze", {
        notice_text: noticeText,
      });
      setAnalysis(res);
    } catch (err) {
      console.error("Notice parsing error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const query = chatInput;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: query }]);

    setTimeout(() => {
      let reply = "Based on statutory provisions, ";
      if (query.toLowerCase().includes("43b") || query.toLowerCase().includes("msme")) {
        reply = "Under Section 43B(h) inserted by Finance Act 2023, any sum payable to a Micro or Small enterprise beyond the time limit specified in Section 15 of the MSMED Act (15 days or maximum 45 days under written agreement) is deductible strictly on actual payment basis. Any unpaid sum at the end of the financial year will be disallowed and added back to taxable business profits for AY 2026-27.";
      } else if (query.toLowerCase().includes("40a(3)") || query.toLowerCase().includes("cash")) {
        reply = "Section 40A(3) mandates 100% disallowance for revenue expenditure payments made in cash or non-account payee instruments exceeding ₹10,000 in a day to a single person (₹35,000 for freight/transport operators). Rule 6DD provides limited statutory exceptions (e.g. banking holidays, agricultural produce payments).";
      } else {
        reply = `Regarding your query on "${query}", as per the applicable statutory sections and CBDT circulars, ensure that necessary working paper lead schedules are indexed with primary voucher references (SA 230 compliant) and supported by third-party bank confirmations.`;
      }
      setChatMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    }, 600);
  };

  const copyFullDraft = () => {
    if (!analysis) return;
    const text = `
BEFORE THE NATIONAL FACELESS ASSESSMENT CENTRE (NFAC), DELHI
In the matter of: ${activeClient ? activeClient.name : "Apex Solutions Pvt Ltd"}
PAN: AAACT1234F | AY: 2025-26 | Notice DIN: ${analysis.din}

WRITTEN SUBMISSION IN RESPONSE TO NOTICE UNDER ${analysis.section_invoked}

RESPECTED SIR/MADAM,

1. PRELIMINARY ACKNOWLEDGEMENT & JURISDICTION:
The Assessee formally acknowledges receipt of Notice bearing DIN ${analysis.din} issued under ${analysis.section_invoked}.

2. STATEMENT OF FACTS:
${analysis.summary_of_impugned_matter}

3. GROUNDS OF DEFENSE:
${analysis.key_legal_defenses.map((d, i) => `${i + 1}. ${d}`).join("\n")}

4. PRAYER:
In light of the documentary evidence annexed in Lead Schedule A-1 and judicial precedents cited above, it is respectfully prayed that the proposed additions be dropped in full.

Yours faithfully,
For ${activeClient ? activeClient.name : "Apex Solutions Pvt Ltd"}
Authorized Representative / CA Partner
    `.trim();

    navigator.clipboard.writeText(text);
    setDraftCopied(true);
    setTimeout(() => setDraftCopied(false), 3000);
  };

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-semibold text-on-surface">
            Statutory Notice Scrutiny &amp; Tax Advisory Copilot
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Document Identification Number (DIN) verification, precedent-backed legal reply drafting, and client-scoped advisory AI.
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-high border border-outline-variant/30 text-xs">
          <button
            onClick={() => setActiveTab("notice")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "notice"
                ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Notice Parser &amp; Drafter
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "chat"
                ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Advisory Chat Copilot
          </button>
        </div>
      </div>

      {/* TAB 1: Notice Scrutiny & Drafter */}
      {activeTab === "notice" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Input Box */}
          <div className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface">
                Notice Ingestion &amp; Optical Text
              </span>
              <span className="font-mono text-[10px] text-outline">
                Sec 142(1) / 143(2) / 148 / DRC-01
              </span>
            </div>

            <textarea
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              rows={8}
              placeholder="Paste official notice text or OCR transcript containing DIN and impugned additions..."
              className="w-full p-3 text-xs font-mono rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-hidden leading-relaxed"
            />

            <button
              onClick={handleAnalyzeNotice}
              disabled={loading}
              className="w-full py-2 rounded bg-primary hover:bg-primary/90 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">psychology</span>
              )}
              <span>Analyze Notice &amp; Draft Rebuttal</span>
            </button>
          </div>

          {/* Right Column: Parsed Results & Draft Response */}
          <div className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface">
                Extracted DIN &amp; Legal Grounds
              </span>
              {analysis && (
                <button
                  onClick={copyFullDraft}
                  className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  <span>{draftCopied ? "Draft Copied!" : "Copy Full Legal Reply"}</span>
                </button>
              )}
            </div>

            {!analysis ? (
              <div className="p-12 text-center text-xs text-on-surface-variant font-mono">
                Click &quot;Analyze Notice &amp; Draft Rebuttal&quot; to parse statutory grounds.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {/* DIN Pill */}
                <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant/25 font-mono">
                  <div className="text-[10px] text-outline uppercase">Document Identification Number (DIN)</div>
                  <div className="font-semibold text-primary text-xs mt-0.5">{analysis.din}</div>
                  <div className="text-[11px] text-on-surface mt-1">
                    Authority: {analysis.issuing_authority}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 rounded bg-surface-container-low">
                    <span className="text-[10px] text-outline block">Section Invoked</span>
                    <span className="font-semibold text-rose-600">{analysis.section_invoked}</span>
                  </div>
                  <div className="p-2 rounded bg-surface-container-low">
                    <span className="text-[10px] text-outline block">Response Timeframe</span>
                    <span className="font-semibold text-amber-600">{analysis.response_deadline_days} Days</span>
                  </div>
                </div>

                {/* Defense Grounds */}
                <div>
                  <span className="font-semibold text-on-surface block mb-1">
                    Key Legal Defenses &amp; Judicial Precedents:
                  </span>
                  <ul className="space-y-1 text-on-surface-variant">
                    {analysis.key_legal_defenses.map((def, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                        <span className="material-symbols-outlined text-[14px] text-emerald-600 shrink-0 mt-0.5">
                          check_circle
                        </span>
                        <span>{def}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Advisory Chat Copilot */}
      {activeTab === "chat" && (
        <div className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex flex-col h-[520px]">
          <div className="p-3 border-b border-outline-variant/20 bg-surface-container-low flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">gavel</span>
              <span className="text-xs font-semibold text-on-surface">
                Senior Tax Advisory AI · Client: {activeClient ? activeClient.name : "Active Enclave"}
              </span>
            </div>
            <span className="font-mono text-[10px] text-emerald-600 font-semibold px-2 py-0.5 rounded bg-emerald-500/10">
              Grounded in Statutes
            </span>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded bg-primary text-white flex items-center justify-center shrink-0 text-xs font-mono">
                    CA
                  </div>
                )}
                <div
                  className={`max-w-[75%] p-3 rounded-lg leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-none"
                      : "bg-surface-container-low text-on-surface border border-outline-variant/20 rounded-bl-none"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 border-t border-outline-variant/20 bg-surface-container-low flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask advisory question (e.g. MSME Section 43B(h) disallowance rules, Section 40A(3) limits)..."
              className="flex-1 px-3 py-2 text-xs rounded border border-outline-variant/30 bg-surface-container-lowest focus:border-primary focus:outline-hidden"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
