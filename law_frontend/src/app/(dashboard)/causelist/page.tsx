"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface CauseListItem {
  id: string;
  item_number: number;
  case_number: string;
  parties: string;
  court_name: string;
  bench: string;
  court_room: string;
  stage: string;
  list_type: string;
  hearing_date: string;
  session: string;
  advocate_counsel: string;
  status: string;
  notes?: string;
}

const FALLBACK_CAUSE_LIST: CauseListItem[] = [
  {
    id: "cl-1",
    item_number: 4,
    case_number: "W.P.(C) 4120/2025",
    parties: "Apex Logistics Infrastructure Ltd. v. Union of India & Ors.",
    court_name: "High Court of Delhi",
    bench: "Hon'ble Mr. Justice Yashwant Varma & Hon'ble Mr. Justice Dharmesh Sharma",
    court_room: "Court Room No. 3",
    stage: "Admission & Interim Relief",
    list_type: "Daily Board (Morning)",
    hearing_date: "2026-11-18",
    session: "10:30 AM",
    advocate_counsel: "Senior Adv. Siddharth Aggarwal / Adv. Rohan Sharma",
    status: "Item in Progress",
    notes: "Matter called out; Senior counsel addressing court on tender disqualification grounds.",
  },
  {
    id: "cl-2",
    item_number: 12,
    case_number: "CS(COMM) 105/2026",
    parties: "Zenith Pharmaceutical Corp v. Biocure Lifesciences Pvt. Ltd.",
    court_name: "High Court of Delhi",
    bench: "Hon'ble Ms. Justice Prathiba M. Singh",
    court_room: "Court Room No. 24",
    stage: "Framing of Issues & Interim Injunction (Order 39)",
    list_type: "Regular List",
    hearing_date: "2026-11-18",
    session: "11:30 AM",
    advocate_counsel: "Adv. Meenakshi Sundaram / Adv. Ananya Roy",
    status: "Next Item",
    notes: "Patent infringement suit. Caveat entered by defendant. Technical expert affidavit filed.",
  },
  {
    id: "cl-3",
    item_number: 21,
    case_number: "ARB.P. 892/2024",
    parties: "Metro Engineering Consortium v. Delhi Metro Rail Corporation",
    court_name: "High Court of Delhi",
    bench: "Hon'ble Mr. Justice Sanjeev Sachdeva",
    court_room: "Court Room No. 11",
    stage: "Section 11 Appointment of Sole Arbitrator",
    list_type: "Supplementary List",
    hearing_date: "2026-11-18",
    session: "02:00 PM",
    advocate_counsel: "Senior Adv. Arvind Nigam / Adv. Gaurav Jain",
    status: "Passed Over",
    notes: "Passed over on first call on joint request of parties to verify tribunal nominee pool.",
  },
  {
    id: "cl-4",
    item_number: 2,
    case_number: "SLP(C) 19283/2025",
    parties: "National Highways Authority of India v. Oriental Structural Engineers",
    court_name: "Supreme Court of India",
    bench: "Hon'ble The Chief Justice of India & Hon'ble Mr. Justice J.B. Pardiwala",
    court_room: "Court No. 1",
    stage: "Notice Returnable / Final Disposal",
    list_type: "Motion Hearing",
    hearing_date: "2026-11-18",
    session: "10:30 AM",
    advocate_counsel: "Senior Adv. Tushar Mehta (SG) / Adv. M.V. Kini",
    status: "Heard & Reserved",
    notes: "Arguments concluded on Section 34 patent illegality ground; judgment reserved.",
  },
];

export default function CauseListTrackerPage() {
  const router = useRouter();

  const [items, setItems] = useState<CauseListItem[]>(FALLBACK_CAUSE_LIST);
  const [courtFilter, setCourtFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Track New Matter Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemNumber, setNewItemNumber] = useState(1);
  const [newCaseNumber, setNewCaseNumber] = useState("");
  const [newParties, setNewParties] = useState("");
  const [newCourtName, setNewCourtName] = useState("High Court of Delhi");
  const [newBench, setNewBench] = useState("");
  const [newCourtRoom, setNewCourtRoom] = useState("Court Room No. 3");
  const [newStage, setNewStage] = useState("Admission & Interim Relief");
  const [newSession, setNewSession] = useState("10:30 AM");
  const [newCounsel, setNewCounsel] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Status Update Popover / Menu
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const loadCauseList = async () => {
    try {
      setIsLoading(true);
      let url = "/law/causelist";
      const params = new URLSearchParams();
      if (courtFilter !== "All") params.append("court", courtFilter);
      if (statusFilter !== "All") params.append("status", statusFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      if (params.toString()) url += `?${params.toString()}`;

      const res = await api.get<CauseListItem[]>(url);
      if (Array.isArray(res) && res.length > 0) {
        setItems(res);
      }
    } catch (err) {
      console.warn("Using fallback cause list data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCauseList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtFilter, statusFilter]);

  const handleTrackNewMatter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseNumber.trim() || !newParties.trim()) return;

    setIsSubmitting(true);
    const payload = {
      item_number: Number(newItemNumber) || 1,
      case_number: newCaseNumber.trim(),
      parties: newParties.trim(),
      court_name: newCourtName,
      bench: newBench.trim() || "Hon'ble Presiding Judge",
      court_room: newCourtRoom.trim(),
      stage: newStage,
      hearing_date: new Date().toISOString().split("T")[0],
      session: newSession,
      advocate_counsel: newCounsel.trim() || "Senior Counsel",
      notes: newNotes.trim() || undefined,
    };

    try {
      const created = await api.post<CauseListItem>("/law/causelist/track", payload);
      setItems((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewCaseNumber("");
      setNewParties("");
    } catch (err) {
      console.error("Failed to track new matter:", err);
      // Fallback in-memory add
      const fallbackItem: CauseListItem = {
        ...payload,
        id: `cl-${Math.random().toString(36).substring(2, 9)}`,
        list_type: "Daily Board",
        status: "Scheduled",
      };
      setItems((prev) => [fallbackItem, ...prev]);
      setShowAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (itemId: string, nextStatus: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: nextStatus } : i))
    );
    setEditingItemId(null);
    try {
      await api.put(`/law/causelist/${itemId}/status`, { status: nextStatus });
    } catch (err) {
      console.error("Failed to update status on server:", err);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchSearch =
      !searchQuery.trim() ||
      item.case_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.parties.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.court_room.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.advocate_counsel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">event_note</span>
              <h1 className="font-headline text-headline-md text-on-surface">
                Cause List Hearing Board Tracker
              </h1>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Live court room monitor for High Court, Supreme Court, and NCLT cause lists. Tracks item numbers called out, pass-overs, and hearings in progress.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>+ Track Matter on Board</span>
            </button>
          </div>
        </div>

        {/* Filters Strip */}
        <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px]">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by case number, party name, bench, or counsel..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:outline-none focus:border-primary"
              />
            </div>

            <select
              value={courtFilter}
              onChange={(e) => setCourtFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low text-on-surface shrink-0"
            >
              <option value="All">All Courts &amp; Tribunals</option>
              <option value="High Court of Delhi">High Court of Delhi</option>
              <option value="Supreme Court of India">Supreme Court of India</option>
              <option value="NCLT">NCLT (Principal Bench)</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low text-on-surface shrink-0"
            >
              <option value="All">All Hearing Statuses</option>
              <option value="Item in Progress">Item in Progress</option>
              <option value="Next Item">Next Item</option>
              <option value="Passed Over">Passed Over</option>
              <option value="Heard & Reserved">Heard &amp; Reserved</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Adjourned">Adjourned</option>
            </select>
          </div>
        </div>

        {/* Cause List Table */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-space-sm">
            <span className="font-label-md text-label-md text-on-surface-variant font-medium">
              Listed Matters ({filteredItems.length}) · Today&apos;s Daily &amp; Supplementary Boards
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant font-medium">
                  <th className="py-2.5 px-3">Item #</th>
                  <th className="py-2.5 px-3">Case Number</th>
                  <th className="py-2.5 px-3">Parties</th>
                  <th className="py-2.5 px-3">Bench &amp; Court Room</th>
                  <th className="py-2.5 px-3">Hearing Stage</th>
                  <th className="py-2.5 px-3">Counsel Appearing</th>
                  <th className="py-2.5 px-3">Session</th>
                  <th className="py-2.5 px-3 text-right">Status &amp; Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-on-surface-variant">
                      Loading live cause list boards...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-on-surface-variant">
                      No matters matching filter on today&apos;s boards.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-3 px-3 font-mono-md text-primary font-bold">
                        #{item.item_number}
                      </td>
                      <td className="py-3 px-3 font-semibold text-on-surface whitespace-nowrap">
                        {item.case_number}
                      </td>
                      <td className="py-3 px-3 text-on-surface-variant max-w-[240px] truncate">
                        <div className="truncate font-medium text-on-surface">{item.parties}</div>
                        <div className="text-[10px] text-outline">{item.court_name}</div>
                      </td>
                      <td className="py-3 px-3 text-on-surface-variant max-w-[220px]">
                        <div className="font-medium text-on-surface">{item.court_room}</div>
                        <div className="text-[10px] text-outline truncate">{item.bench}</div>
                      </td>
                      <td className="py-3 px-3 text-on-surface font-medium">{item.stage}</td>
                      <td className="py-3 px-3 text-on-surface-variant text-[11px]">
                        {item.advocate_counsel}
                      </td>
                      <td className="py-3 px-3 text-outline whitespace-nowrap">{item.session}</td>
                      <td className="py-3 px-3 text-right relative">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                              item.status === "Item in Progress"
                                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                                : item.status === "Next Item"
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/30"
                                : item.status === "Passed Over"
                                ? "bg-rose-500/10 text-rose-600 border border-rose-500/30"
                                : item.status === "Heard & Reserved"
                                ? "bg-primary/10 text-primary border border-primary/30"
                                : "bg-surface-container-high text-on-surface-variant"
                            }`}
                          >
                            {item.status}
                          </span>

                          <button
                            type="button"
                            onClick={() => setEditingItemId(editingItemId === item.id ? null : item.id)}
                            className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant cursor-pointer"
                            title="Update status"
                          >
                            <span className="material-symbols-outlined text-[15px]">edit</span>
                          </button>
                        </div>

                        {/* Status Change Dropdown */}
                        {editingItemId === item.id && (
                          <div className="absolute right-3 top-full mt-1 z-30 bg-surface-container-lowest border border-outline-variant/40 rounded-lg shadow-lg py-1 w-44 text-left">
                            {[
                              "Item in Progress",
                              "Next Item",
                              "Passed Over",
                              "Heard & Reserved",
                              "Scheduled",
                              "Adjourned",
                            ].map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleUpdateStatus(item.id, st)}
                                className="w-full px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container block cursor-pointer"
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Track New Matter Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/40 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <h3 className="font-headline text-headline-sm text-on-surface">
                  Track Matter on Daily Cause List
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleTrackNewMatter} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Item Number *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={newItemNumber}
                      onChange={(e) => setNewItemNumber(parseInt(e.target.value) || 1)}
                      required
                      className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low font-mono-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Case Number *
                    </label>
                    <input
                      type="text"
                      value={newCaseNumber}
                      onChange={(e) => setNewCaseNumber(e.target.value)}
                      placeholder="e.g. CS(COMM) 210/2026"
                      required
                      className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Cause Title / Parties *
                  </label>
                  <input
                    type="text"
                    value={newParties}
                    onChange={(e) => setNewParties(e.target.value)}
                    placeholder="e.g. Acme Corp v. Union of India & Ors."
                    required
                    className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Court / Forum
                    </label>
                    <select
                      value={newCourtName}
                      onChange={(e) => setNewCourtName(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low text-on-surface"
                    >
                      <option value="High Court of Delhi">High Court of Delhi</option>
                      <option value="Supreme Court of India">Supreme Court of India</option>
                      <option value="NCLT New Delhi (Principal Bench)">NCLT Principal Bench</option>
                      <option value="District Court Saket">District Court Saket</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Court Room
                    </label>
                    <input
                      type="text"
                      value={newCourtRoom}
                      onChange={(e) => setNewCourtRoom(e.target.value)}
                      placeholder="Court Room No. 24"
                      className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Hearing Stage
                    </label>
                    <input
                      type="text"
                      value={newStage}
                      onChange={(e) => setNewStage(e.target.value)}
                      placeholder="e.g. Final Arguments / Order 39"
                      className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Counsel Appearing
                    </label>
                    <input
                      type="text"
                      value={newCounsel}
                      onChange={(e) => setNewCounsel(e.target.value)}
                      placeholder="Senior Adv. Siddharth Aggarwal"
                      className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isSubmitting ? "Tracking..." : "Add to Cause List"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
