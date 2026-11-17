"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface PrecedentItem {
  id: string;
  case_name: string;
  citation: string;
  neutral_citation: string;
  court: string;
  year: number;
  bench_size: number;
  practice_area: string;
  ratio_decidendi: string;
  principles: string[];
  status: string;
  key_passages: string;
}

const FALLBACK_PRECEDENTS: PrecedentItem[] = [
  {
    id: "prec-kesavananda",
    case_name: "Kesavananda Bharati Sripadagalvaru v. State of Kerala",
    citation: "(1973) 4 SCC 225",
    neutral_citation: "1973 INSC 258",
    court: "Supreme Court of India",
    year: 1973,
    bench_size: 13,
    practice_area: "Constitutional Law",
    ratio_decidendi: "Parliament amending power under Article 368 cannot damage or destroy the 'Basic Structure' of the Constitution.",
    principles: [
      "Basic Structure Doctrine established.",
      "Judicial review is an integral part of the basic structure.",
    ],
    status: "Binding Landmark Law",
    key_passages: "The power of amendment under Article 368 does not include the power to alter the basic structure.",
  },
  {
    id: "prec-scg-contracts",
    case_name: "SCG Contracts (India) Pvt. Ltd. v. K.S. Chamankar Infrastructure",
    citation: "(2019) 12 SCC 210",
    neutral_citation: "2019 INSC 182",
    court: "Supreme Court of India",
    year: 2019,
    bench_size: 2,
    practice_area: "Commercial Litigation & CPC",
    ratio_decidendi: "In commercial suits, the 120-day outer ceiling for filing a Written Statement is mandatory and non-extendable.",
    principles: [
      "Right to file Written Statement is forfeited immediately upon expiration of 120 days.",
      "Section 151 inherent power cannot bypass express statutory mandate.",
    ],
    status: "Binding Landmark Law",
    key_passages: "Beyond 120 days, the defendant shall forfeit the right to file the written statement.",
  },
  {
    id: "prec-vidya-drolia",
    case_name: "Vidya Drolia and Others v. Durga Trading Corporation",
    citation: "(2021) 2 SCC 1",
    neutral_citation: "2020 INSC 697",
    court: "Supreme Court of India",
    year: 2020,
    bench_size: 3,
    practice_area: "Arbitration & Dispute Resolution",
    ratio_decidendi: "Established the 4-fold test for non-arbitrability of disputes. Landlord-tenant disputes under Transfer of Property Act are arbitrable.",
    principles: [
      "Section 8 & 11 referral standard: 'Prima facie' review only.",
      "Competence-Competence: Arbitral Tribunal has primary jurisdiction to decide its own competence.",
    ],
    status: "Binding Landmark Law",
    key_passages: "When in doubt, refer to arbitration. Full merits examination belongs to the arbitrator.",
  },
];

export default function PrecedentsPage() {
  const router = useRouter();

  const [precedents, setPrecedents] = useState<PrecedentItem[]>(FALLBACK_PRECEDENTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPracticeArea, setSelectedPracticeArea] = useState("All");
  const [isLoading, setIsLoading] = useState(true);

  // AI Matcher State
  const [factProposition, setFactProposition] = useState("");
  const [isMatching, setIsMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<any | null>(null);

  // Toast / Copy
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadPrecedents = async () => {
    try {
      setIsLoading(true);
      let url = "/law/precedents";
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append("q", searchQuery.trim());
      if (selectedPracticeArea !== "All") params.append("practice_area", selectedPracticeArea);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await api.get<PrecedentItem[]>(url);
      if (Array.isArray(res) && res.length > 0) {
        setPrecedents(res);
      }
    } catch (err) {
      console.warn("Using fallback precedents:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrecedents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPracticeArea]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPrecedents();
  };

  const handleCopyCitation = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Citation copied to clipboard.");
    } catch {
      showToast("Clipboard unavailable.");
    }
  };

  const handleMatchProposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factProposition.trim()) return;

    setIsMatching(true);
    try {
      const res = await api.post("/law/precedents/match", {
        facts_or_proposition: factProposition.trim(),
      });
      setMatchResult(res);
      showToast("Matching landmark precedents retrieved.");
    } catch {
      showToast("Precedent match query failed.");
    } finally {
      setIsMatching(false);
    }
  };

  const practiceAreas = [
    "All",
    "Constitutional Law",
    "Arbitration",
    "Commercial Litigation",
    "Insolvency & Bankruptcy",
    "Criminal Procedure",
    "Civil Procedure",
  ];

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-on-surface text-surface px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
            <span>{toast}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">account_balance</span>
              <h1 className="font-headline text-headline-md text-on-surface">
                Case Law Precedents &amp; Binding Ratios
              </h1>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Curated compendium of landmark Supreme Court of India and High Court authorities with extracted ratio decidendi and citation index.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-surface-container-high border border-outline-variant/30 font-mono-sm text-[11px] text-on-surface-variant">
              Supreme Court &amp; High Courts
            </span>
          </div>
        </div>

        {/* AI Precedent Matcher Banner */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">psychology</span>
            <h2 className="font-headline text-headline-sm text-on-surface">
              Proposition &amp; Factual Matrix Matcher
            </h2>
          </div>
          <p className="text-xs text-on-surface-variant">
            Enter your legal contention or client fact scenario to retrieve authoritative dictum and suggested advocacy framing.
          </p>

          <form onSubmit={handleMatchProposition} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={factProposition}
              onChange={(e) => setFactProposition(e.target.value)}
              placeholder="e.g. Defendant failed to file Written Statement within 120 days in a commercial suit..."
              className="flex-1 px-3.5 py-2 text-xs rounded-lg border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={isMatching || !factProposition.trim()}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">search_check</span>
              <span>{isMatching ? "Matching Ratios..." : "Find Precedents"}</span>
            </button>
          </form>

          {matchResult && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2 text-xs">
              <span className="font-semibold text-primary block">
                Suggested Advocacy Framing:
              </span>
              <p className="text-on-surface leading-relaxed">
                {matchResult.suggested_argument_framing}
              </p>
            </div>
          )}
        </div>

        {/* Search & Practice Area Filters */}
        <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[16px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search precedents by case name, citation (e.g. 2019 12 SCC 210), or ratio..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-surface-container-high hover:bg-surface-container-highest text-xs font-medium text-on-surface cursor-pointer border border-outline-variant/30"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {practiceAreas.map((pa) => (
              <button
                key={pa}
                type="button"
                onClick={() => setSelectedPracticeArea(pa)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  selectedPracticeArea === pa
                    ? "bg-primary text-white"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {pa}
              </button>
            ))}
          </div>
        </div>

        {/* Precedents Cards List */}
        <div className="space-y-space-md">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              Loading landmark authorities...
            </div>
          ) : precedents.length === 0 ? (
            <div className="p-12 text-center text-xs text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              No precedents found matching query.
            </div>
          ) : (
            precedents.map((prec) => (
              <div
                key={prec.id}
                className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3 hover:border-outline-variant/60 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-outline-variant/20 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono-sm bg-primary/10 text-primary border border-primary/20">
                        {prec.practice_area}
                      </span>
                      <span className="text-[11px] font-mono-sm text-outline">
                        {prec.court} ({prec.year}) · Bench of {prec.bench_size} Judges
                      </span>
                    </div>
                    <h3 className="font-headline text-headline-sm font-semibold text-on-surface">
                      {prec.case_name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs font-mono-sm text-primary font-medium">
                      <span>{prec.citation}</span>
                      <span>·</span>
                      <span className="text-outline">{prec.neutral_citation}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyCitation(`${prec.case_name}, ${prec.citation}`)}
                      className="px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-xs text-on-surface flex items-center gap-1 cursor-pointer transition-colors"
                      title="Copy legal citation"
                    >
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                      <span>Copy Citation</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/chat?topic=${encodeURIComponent(prec.case_name)}`)}
                      className="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-medium flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">chat</span>
                      <span>Cite in Copilot</span>
                    </button>
                  </div>
                </div>

                {/* Ratio Decidendi */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider block">
                    Ratio Decidendi:
                  </span>
                  <p className="text-xs text-on-surface leading-relaxed font-medium">
                    {prec.ratio_decidendi}
                  </p>
                </div>

                {/* Binding Dictum / Principles */}
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-outline uppercase block">
                    Key Legal Principles:
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-on-surface-variant">
                    {prec.principles.map((pr, idx) => (
                      <li key={idx}>{pr}</li>
                    ))}
                  </ul>
                </div>

                {/* Key Passages */}
                {prec.key_passages && (
                  <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/20 text-xs italic text-on-surface-variant">
                    &ldquo;{prec.key_passages}&rdquo;
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
