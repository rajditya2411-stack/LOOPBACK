"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface LimitationCategory {
  id: string;
  title: string;
  statute: string;
  period_years: number;
  period_days: number;
  court_forum: string;
  applies_sec_5: boolean;
  description: string;
  key_principles: string[];
}

interface CalculationResult {
  category_id: string;
  category_title: string;
  statute_reference: string;
  cause_of_action_date: string;
  acknowledgment_date: string | null;
  acknowledgment_valid?: boolean | null;
  effective_start_date: string;
  pre_institution_mediation_days_excluded: number;
  statutory_limitation_days: number;
  computed_deadline: string;
  days_remaining: number;
  is_barred_by_limitation: boolean;
  condonation_available_under_sec_5: boolean;
  urgency_tier: string;
  commercial_ws_120_day_deadline?: string | null;
  legal_rules: string[];
  action_recommendation: string;
}

const FALLBACK_CATEGORIES: LimitationCategory[] = [
  {
    id: "lim-contract-debt",
    title: "Suits Relating to Contracts & Debt Recovery",
    statute: "Limitation Act, 1963 - Articles 14, 15, 18, 55",
    period_years: 3.0,
    period_days: 1095,
    court_forum: "Civil Court / Commercial Court",
    applies_sec_5: false,
    description: "3 years from when the debt becomes payable or breach occurs.",
    key_principles: [
      "Section 18 Limitation Act: Written acknowledgment starts fresh period of limitation.",
      "Section 5 (Condonation) DOES NOT apply to original suits.",
    ],
  },
  {
    id: "lim-commercial-suit",
    title: "Commercial Suit (Commercial Courts Act, 2015)",
    statute: "Commercial Courts Act 2015 (Sec 12A) & Order VIII Rule 1 CPC Amendment",
    period_years: 3.0,
    period_days: 1095,
    court_forum: "Designated Commercial Court",
    applies_sec_5: false,
    description: "3 years for suit; 120-day absolute ceiling for Written Statement.",
    key_principles: [
      "SCG Contracts (SC 2019): 120-day outer limit for Written Statement is mandatory.",
      "Section 12A pre-institution mediation period is excluded.",
    ],
  },
  {
    id: "lim-appeal-hc",
    title: "First Appeal to High Court",
    statute: "Limitation Act, 1963 - Article 116(a)",
    period_years: 0.25,
    period_days: 90,
    court_forum: "High Court (Appellate Jurisdiction)",
    applies_sec_5: true,
    description: "90 days from the date of the decree or order appealed against.",
    key_principles: [
      "Section 12: Certified copy preparation period is excluded.",
      "Section 5 condonation application available upon sufficient cause.",
    ],
  },
  {
    id: "lim-sec34-arbitration",
    title: "Setting Aside Arbitral Award (Section 34)",
    statute: "Arbitration and Conciliation Act, 1996 - Section 34(3)",
    period_years: 0.25,
    period_days: 90,
    court_forum: "Commercial Court / High Court Original Side",
    applies_sec_5: false,
    description: "3 months + maximum discretionary extension of 30 days only.",
    key_principles: [
      "Popular Construction (SC 2001): Section 5 Limitation Act excluded by necessary implication.",
      "Court has NO power to condone delay beyond 30 days after the 3-month window.",
    ],
  },
];

export default function LimitationCalculatorPage() {
  const [categories, setCategories] = useState<LimitationCategory[]>(FALLBACK_CATEGORIES);
  const [selectedCatId, setSelectedCatId] = useState<string>("lim-commercial-suit");
  const [causeOfActionDate, setCauseOfActionDate] = useState<string>("2025-06-01");
  const [acknowledgmentDate, setAcknowledgmentDate] = useState<string>("");
  const [mediationDays, setMediationDays] = useState<number>(30);
  const [courtForum, setCourtForum] = useState<string>("High Court of Delhi (Commercial Division)");

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch Categories on Mount
  useEffect(() => {
    api.get<LimitationCategory[]>("/law/limitation/categories")
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
        }
      })
      .catch((err) => {
        console.warn("Using fallback limitation categories:", err);
      });
  }, []);

  // Run calculation
  const handleCalculate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsCalculating(true);
    setErrorMsg(null);

    const payload = {
      category_id: selectedCatId,
      cause_of_action_date: causeOfActionDate,
      acknowledgment_date: acknowledgmentDate.trim() ? acknowledgmentDate : null,
      pre_institution_mediation_days: Number(mediationDays) || 0,
      court_forum: courtForum,
    };

    try {
      const res = await api.post<CalculationResult>("/law/limitation/calculate", payload);
      setResult(res);
    } catch (err: unknown) {
      console.warn("Backend calculation fallback:", err);
      // Client-side fallback calculation
      const cat = categories.find((c) => c.id === selectedCatId) || categories[0];
      const startCoa = new Date(causeOfActionDate);
      const originalDeadline = new Date(startCoa.getTime() + cat.period_days * 86400000);

      let effectiveStart = causeOfActionDate;
      let ackValid: boolean | null = null;
      let isBarredByExpiredAck = false;

      if (acknowledgmentDate.trim()) {
        const ackDt = new Date(acknowledgmentDate.trim());
        if (ackDt > originalDeadline) {
          // Under Section 18(1), acknowledgment after expiration does not revive barred debt
          ackValid = false;
          isBarredByExpiredAck = true;
          effectiveStart = causeOfActionDate;
        } else if (ackDt > startCoa) {
          ackValid = true;
          effectiveStart = acknowledgmentDate.trim();
        } else {
          ackValid = false;
        }
      }

      const start = new Date(effectiveStart);
      const deadline = isBarredByExpiredAck
        ? originalDeadline
        : new Date(start.getTime() + (cat.period_days + (Number(mediationDays) || 0)) * 86400000);
      const today = new Date();
      const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
      const isBarred = isBarredByExpiredAck || diffDays < 0;

      let rec = "Limitation is well within statutory timeline.";
      if (isBarredByExpiredAck) {
        rec = `CRITICAL: The written acknowledgment dated ${acknowledgmentDate} was executed after the original limitation period expired on ${originalDeadline.toISOString().split("T")[0]}. Under Section 18(1) Limitation Act 1963, acknowledgment must be made BEFORE expiration. Suit is time-barred.`;
      } else if (isBarred) {
        rec = cat.applies_sec_5
          ? "Statutory period expired. File Section 5 Condonation Application with affidavit."
          : "CRITICAL: Original suit time-barred. Section 5 does NOT apply to original suits. Plaint liable to rejection under Order VII Rule 11(d) CPC.";
      }

      setResult({
        category_id: cat.id,
        category_title: cat.title,
        statute_reference: cat.statute,
        cause_of_action_date: causeOfActionDate,
        acknowledgment_date: acknowledgmentDate || null,
        acknowledgment_valid: ackValid,
        effective_start_date: effectiveStart,
        pre_institution_mediation_days_excluded: Number(mediationDays) || 0,
        statutory_limitation_days: cat.period_days,
        computed_deadline: deadline.toISOString().split("T")[0],
        days_remaining: diffDays,
        is_barred_by_limitation: isBarred,
        condonation_available_under_sec_5: cat.applies_sec_5,
        urgency_tier: isBarred ? "Time-Barred" : diffDays <= 30 ? "Critical" : "Safe",
        commercial_ws_120_day_deadline: cat.id === "lim-commercial-suit" ? new Date(start.getTime() + 120 * 86400000).toISOString().split("T")[0] : null,
        legal_rules: cat.key_principles,
        action_recommendation: rec,
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Run initial calculation
  useEffect(() => {
    handleCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCatId]);

  const selectedCategory = categories.find((c) => c.id === selectedCatId) || categories[0];

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">schedule</span>
              <h1 className="font-headline text-headline-md text-on-surface">
                Limitation Period Calculator
              </h1>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Precision statutory deadline calculator under the Limitation Act 1963, Section 18 debt acknowledgments, and Commercial Courts Act 2015 tolling rules.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-surface-container-high border border-outline-variant/30 font-mono-sm text-[11px] text-on-surface-variant">
              Indian Limitation Act, 1963
            </span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-on-surface-variant mr-1">Case Scenarios:</span>
          {[
            { label: "Commercial Suit (120-Day WS)", cat: "lim-commercial-suit", coa: "2025-08-01", med: 30 },
            { label: "Debt Recovery (Sec 18 Acknowledged)", cat: "lim-contract-debt", coa: "2023-03-15", ack: "2025-06-10", med: 0 },
            { label: "Arbitration Sec 34 Challenge", cat: "lim-sec34-arbitration", coa: "2026-09-01", med: 0 },
            { label: "High Court Regular First Appeal", cat: "lim-appeal-hc", coa: "2026-10-15", med: 0 },
          ].map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setSelectedCatId(preset.cat);
                setCauseOfActionDate(preset.coa);
                setAcknowledgmentDate(preset.ack || "");
                setMediationDays(preset.med);
              }}
              className="px-2.5 py-1 rounded-md border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-xs text-on-surface transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Two Column Grid: Calculator Input vs Statutory Assessment */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Input Form (5 Cols) */}
          <div className="lg:col-span-5 p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
            <div className="border-b border-outline-variant/20 pb-space-sm">
              <h2 className="font-headline text-headline-sm text-on-surface">
                Cause of Action Parameters
              </h2>
            </div>

            <form onSubmit={handleCalculate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface mb-1">
                  Dispute Nature / Limitation Schedule *
                </label>
                <select
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low text-on-surface"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.period_days >= 365 ? `${c.period_days / 365} Years` : `${c.period_days} Days`})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-outline mt-1">{selectedCategory.statute}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface mb-1">
                  Cause of Action Accrual Date *
                </label>
                <input
                  type="date"
                  value={causeOfActionDate}
                  onChange={(e) => setCauseOfActionDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface mb-1">
                  Section 18 Written Acknowledgment / Part-Payment Date (Optional)
                </label>
                <input
                  type="date"
                  value={acknowledgmentDate}
                  onChange={(e) => setAcknowledgmentDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                />
                <p className="text-[11px] text-outline mt-1">
                  Written acknowledgment of liability signed by debtor restarts statutory limitation period.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface mb-1">
                  Pre-Institution Mediation Exclusion Days (Sec 12A Commercial Courts Act)
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={mediationDays}
                  onChange={(e) => setMediationDays(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                />
                <p className="text-[11px] text-outline mt-1">
                  Days spent in mediation under Section 12A are excluded from limitation computation.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface mb-1">
                  Court / Judicial Forum
                </label>
                <input
                  type="text"
                  value={courtForum}
                  onChange={(e) => setCourtForum(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isCalculating}
                  className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">calculate</span>
                  <span>{isCalculating ? "Calculating..." : "Compute Statutory Limitation"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Results & Legal Directives (7 Cols) */}
          <div className="lg:col-span-7 space-y-space-md">
            {result ? (
              <>
                {/* Status Hero Card */}
                <div className={`p-space-lg rounded-xl border shadow-xs space-y-3 ${
                  result.is_barred_by_limitation
                    ? "bg-error/5 border-error/30"
                    : result.days_remaining <= 30
                    ? "bg-amber-500/5 border-amber-500/30"
                    : "bg-emerald-500/5 border-emerald-500/30"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                      result.is_barred_by_limitation
                        ? "bg-error text-white"
                        : result.days_remaining <= 30
                        ? "bg-amber-600 text-white"
                        : "bg-emerald-600 text-white"
                    }`}>
                      {result.urgency_tier}
                    </span>
                    <span className="text-xs font-mono-sm text-outline">
                      Statutory Period: {result.statutory_limitation_days} Days
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <span className="text-[11px] text-outline block">Statutory Deadline</span>
                      <div className="font-headline text-lg font-bold text-on-surface">
                        {result.computed_deadline}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-outline block">Days Remaining</span>
                      <div className={`font-headline text-lg font-bold ${
                        result.is_barred_by_limitation
                          ? "text-error"
                          : result.days_remaining <= 30
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}>
                        {result.is_barred_by_limitation
                          ? `${Math.abs(result.days_remaining)} Days Overdue`
                          : `${result.days_remaining} Days Remaining`}
                      </div>
                    </div>
                  </div>

                  {result.commercial_ws_120_day_deadline && (
                    <div className="mt-2 p-2.5 rounded-lg bg-surface-container-high/60 border border-outline-variant/30 flex items-center justify-between text-xs">
                      <span className="font-semibold text-on-surface">120-Day Written Statement Cutoff:</span>
                      <span className="font-mono-sm font-bold text-error">
                        {result.commercial_ws_120_day_deadline} (SCG Contracts Rule)
                      </span>
                    </div>
                  )}

                  {result.acknowledgment_date && (
                    <div className={`mt-2 p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                      result.acknowledgment_valid === false
                        ? "bg-error/10 border-error/30 text-error"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                    }`}>
                      <span className="font-semibold">Section 18 Acknowledgment ({result.acknowledgment_date}):</span>
                      <span className="font-mono-sm font-bold">
                        {result.acknowledgment_valid === false
                          ? "INVALID (Post-Expiration Bar)"
                          : "VALID (Fresh Period Commenced)"}
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-on-surface leading-relaxed pt-1">
                    <strong>Counsel Directive:</strong> {result.action_recommendation}
                  </p>
                </div>

                {/* Section 5 Condonation Analysis */}
                <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
                    <h3 className="font-headline text-headline-sm text-on-surface">
                      Section 5 Limitation Act (Condonation of Delay) Analysis
                    </h3>
                  </div>

                  <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
                    result.condonation_available_under_sec_5
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                      : "bg-error/10 border-error/30 text-error"
                  }`}>
                    {result.condonation_available_under_sec_5 ? (
                      <div>
                        <strong>Section 5 is Applicable:</strong> This is an appeal/application forum. Delay may be condoned by the Court if appellant shows sufficient cause (e.g. Collector Land Acquisition v. Katiji doctrine).
                      </div>
                    ) : (
                      <div>
                        <strong>Section 5 DOES NOT Apply:</strong> Under Section 5 of the Limitation Act 1963, condonation of delay is expressly barred for original suits. If limitation has expired, the plaint must be rejected under Section 3 and Order VII Rule 11(d) CPC.
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Legal Principles */}
                <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-2">
                  <h3 className="font-headline text-headline-sm text-on-surface">
                    Governing Statutory Rulings &amp; Precedents
                  </h3>
                  <ul className="list-disc list-inside space-y-1.5 text-xs text-on-surface-variant leading-relaxed">
                    {result.legal_rules.map((rule, idx) => (
                      <li key={idx}>{rule}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-xs text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                Configure parameters on the left to compute statutory limitation.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
