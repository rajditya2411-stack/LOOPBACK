"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface RatioItem {
  name: string;
  current_year: number;
  previous_year: number;
  variance_percentage: number;
  is_statutory_variance: boolean;
  status: string;
  suggested_note: string | null;
}

const DEFAULT_RATIOS = [
  { name: "Current Ratio", current_year: 2.15, previous_year: 1.45, unit: "ratio" },
  { name: "Debt-Equity Ratio", current_year: 0.72, previous_year: 0.95, unit: "ratio" },
  { name: "Debt Service Coverage Ratio (DSCR)", current_year: 2.40, previous_year: 2.10, unit: "ratio" },
  { name: "Return on Equity (ROE)", current_year: 18.5, previous_year: 14.2, unit: "percentage" },
  { name: "Inventory Turnover Ratio", current_year: 6.4, previous_year: 4.8, unit: "times" },
  { name: "Trade Receivables Turnover Ratio", current_year: 7.2, previous_year: 5.1, unit: "times" },
  { name: "Trade Payables Turnover Ratio", current_year: 4.5, previous_year: 4.3, unit: "times" },
  { name: "Net Capital Turnover Ratio", current_year: 5.8, previous_year: 4.2, unit: "times" },
  { name: "Net Profit Ratio", current_year: 9.8, previous_year: 7.1, unit: "percentage" },
  { name: "Return on Capital Employed (ROCE)", current_year: 16.2, previous_year: 12.0, unit: "percentage" },
  { name: "Return on Investment (ROI)", current_year: 14.5, previous_year: 11.2, unit: "percentage" },
];

export default function FinancialsPage() {
  const [ratioData, setRatioData] = useState(DEFAULT_RATIOS);
  const [results, setResults] = useState<RatioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const calculateRatios = async () => {
    setLoading(true);
    try {
      const data = await api.post<RatioItem[]>("/ca/financials/ratios", {
        ratios: ratioData,
      });
      setResults(data);
    } catch (err) {
      console.warn("Backend unavailable, computing Schedule III ratios client-side:", err);
      // Client-side fallback computation
      const localResults: RatioItem[] = ratioData.map((item) => {
        const prev = item.previous_year;
        const curr = item.current_year;
        const var_pct = prev === 0 ? (curr > 0 ? 100.0 : 0.0) : Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(2));
        const is_statutory = Math.abs(var_pct) >= 25.0;
        const direction = var_pct > 0 ? "increase" : "decrease";
        const suggested_note = is_statutory
          ? `The ${item.name} experienced a ${Math.abs(var_pct)}% ${direction} from ${prev} to ${curr}. As per Schedule III Part I of Companies Act, 2013, explanation is provided: The variation is primarily attributable to operational volume shifts, working capital adjustments, and market conditions.`
          : null;
        return {
          name: item.name,
          current_year: curr,
          previous_year: prev,
          variance_percentage: var_pct,
          is_statutory_variance: is_statutory,
          status: is_statutory ? "Requires Mandatory Disclosure Note" : "Within Normal Threshold",
          suggested_note,
        };
      });
      setResults(localResults);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void calculateRatios();
  }, []);

  const handleInputChange = (index: number, field: "current_year" | "previous_year", val: string) => {
    const num = parseFloat(val) || 0;
    setRatioData((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: num };
      return updated;
    });
  };

  const copyNote = (note: string | null, idx: number) => {
    if (!note) return;
    navigator.clipboard.writeText(note);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const statutoryVariancesCount = results.filter((r) => r.is_statutory_variance).length;

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-semibold text-on-surface">
            Schedule III Financials &amp; Ratio Variance Engine
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Companies Act 2013 mandatory 11 ratios. Automatic &gt;25% variance alerts and statutory disclosure note generator.
          </p>
        </div>

        <button
          onClick={calculateRatios}
          disabled={loading}
          className="px-3.5 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          {loading ? (
            <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-[16px]">calculate</span>
          )}
          <span>Recalculate Ratios</span>
        </button>
      </div>

      {/* Statutory Variance Alert Banner */}
      {statutoryVariancesCount > 0 && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0 mt-0.5">warning</span>
          <div>
            <span className="font-semibold block">
              Schedule III Mandatory Disclosure Triggered ({statutoryVariancesCount} Ratios &gt; 25% Variance)
            </span>
            <p className="mt-0.5 leading-relaxed text-on-surface-variant">
              Under Part I of Schedule III to the Companies Act 2013, whenever the variance in any ratio exceeds 25% as compared to the preceding financial year, an explanatory commentary note is mandatory in the Notes to Financial Statements.
            </p>
          </div>
        </div>
      )}

      {/* Ratios Table */}
      <div className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 overflow-hidden shadow-xs">
        <div className="p-3 border-b border-outline-variant/20 bg-surface-container-low flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface">
            Companies Act 2013 Schedule III Ratio Matrix
          </span>
          <span className="text-[11px] font-mono text-outline">
            11 Statutory Ratios · All benchmarked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-high/40 text-on-surface-variant text-[11px] font-mono uppercase border-b border-outline-variant/20">
              <tr>
                <th className="py-2.5 px-3">Statutory Ratio</th>
                <th className="py-2.5 px-3 text-right">CY (FY 2025-26)</th>
                <th className="py-2.5 px-3 text-right">PY (FY 2024-25)</th>
                <th className="py-2.5 px-3 text-right">Variance (%)</th>
                <th className="py-2.5 px-3">Statutory Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-on-surface-variant font-mono">
                    Computing ratios...
                  </td>
                </tr>
              ) : (
                results.map((r, idx) => (
                  <tr
                    key={r.name}
                    className={`hover:bg-surface-container-low/50 transition-colors ${
                      r.is_statutory_variance ? "bg-rose-500/5" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-medium text-on-surface">
                      <div className="flex items-center gap-1.5">
                        {r.is_statutory_variance && (
                          <span className="material-symbols-outlined text-[15px] text-rose-600">
                            flag
                          </span>
                        )}
                        <span>{r.name}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono">
                      <input
                        type="number"
                        step="0.01"
                        value={ratioData[idx]?.current_year ?? r.current_year}
                        onChange={(e) => handleInputChange(idx, "current_year", e.target.value)}
                        className="w-20 px-1.5 py-0.5 text-right font-mono text-xs rounded border border-outline-variant/30 bg-surface-container-low"
                      />
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono">
                      <input
                        type="number"
                        step="0.01"
                        value={ratioData[idx]?.previous_year ?? r.previous_year}
                        onChange={(e) => handleInputChange(idx, "previous_year", e.target.value)}
                        className="w-20 px-1.5 py-0.5 text-right font-mono text-xs rounded border border-outline-variant/30 bg-surface-container-low"
                      />
                    </td>

                    <td
                      className={`py-2.5 px-3 text-right font-mono font-semibold ${
                        r.is_statutory_variance
                          ? "text-rose-600"
                          : r.variance_percentage >= 0
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {r.variance_percentage > 0 ? `+${r.variance_percentage}%` : `${r.variance_percentage}%`}
                    </td>

                    <td className="py-2.5 px-3">
                      {r.is_statutory_variance ? (
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 font-semibold border border-rose-500/20">
                          &gt; 25% VARIANCE (DISCLOSE)
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                          Within Normal Range
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      {r.suggested_note ? (
                        <button
                          onClick={() => copyNote(r.suggested_note, idx)}
                          className="text-[11px] text-primary hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                          title="Copy Draft Schedule III Disclosure Note"
                        >
                          <span className="material-symbols-outlined text-[13px]">content_copy</span>
                          <span>{copiedIndex === idx ? "Copied!" : "Copy Note"}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-outline font-mono">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
