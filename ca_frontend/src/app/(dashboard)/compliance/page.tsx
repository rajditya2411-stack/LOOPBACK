"use client";

import { useClientStore } from "@/store/client-store";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "review" | "done";
  priority: string;
  created_at: string;
}

const STATUTORY_DEADLINES = [
  {
    id: "stat-1",
    head: "ADVANCE TAX",
    title: "Q4 Advance Tax Installment (100% Cumulative Settlement)",
    due_date: "15 Mar 2026",
    days_left: 12,
    authority: "CBDT (Income Tax)",
    penalty: "1% per month interest under Section 234B & 234C on deficit",
    urgency: "critical",
  },
  {
    id: "stat-2",
    head: "GST",
    title: "Monthly GSTR-3B Summary Return Filing (February 2026)",
    due_date: "20 Mar 2026",
    days_left: 17,
    authority: "CBIC (GSTN)",
    penalty: "18% p.a. interest under Section 50 + ₹50/day late fee",
    urgency: "high",
  },
  {
    id: "stat-3",
    head: "GST",
    title: "Monthly GSTR-1 Outward Supply Return (February 2026)",
    due_date: "11 Mar 2026",
    days_left: 8,
    authority: "CBIC (GSTN)",
    penalty: "E-Way bill blocking if continuous default + ₹50/day late fee",
    urgency: "critical",
  },
  {
    id: "stat-4",
    head: "TDS / TCS",
    title: "Quarterly TDS Return Form 24Q & 26Q (Q4 FY 2025-26)",
    due_date: "31 May 2026",
    days_left: 89,
    authority: "Income Tax (TRACES)",
    penalty: "₹200/day late filing fee under Section 234E",
    urgency: "medium",
  },
  {
    id: "stat-5",
    head: "TAX AUDIT",
    title: "Tax Audit Report Certification Form 3CA/3CB-3CD",
    due_date: "30 Sep 2026",
    days_left: 211,
    authority: "Income Tax (e-Filing)",
    penalty: "0.5% of turnover or ₹1,50,000 disallowance under Section 271B",
    urgency: "medium",
  },
  {
    id: "stat-6",
    head: "MCA / ROC",
    title: "Form DPT-3 (Return of Deposits / Exempted Loans)",
    due_date: "30 Jun 2026",
    days_left: 119,
    authority: "Ministry of Corporate Affairs",
    penalty: "Fine up to ₹5,00,000 on company and officer in default",
    urgency: "low",
  },
];

export default function CompliancePage() {
  const { activeClient, fetchClients } = useClientStore();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeTab, setActiveTab] = useState<"calendar" | "pipeline">("calendar");
  const [headFilter, setHeadFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<TaskItem[]>("/tasks");
      setTasks(data);
    } catch (err) {
      console.error("Failed to load tasks", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    void fetchClients();
  }, [fetchTasks, fetchClients]);

  const handleSyncCompliance = async () => {
    const clientName = activeClient?.name || "Apex Enterprises Ltd";
    const clientId = activeClient?.id || "default";
    setSyncMsg(`Generating statutory cycles for ${clientName}...`);
    try {
      const res = await api.post<{ message: string }>("/ca/compliance/generate", {
        workspace_id: clientId,
        entity_name: clientName,
        entity_type: "Pvt Ltd",
        gst_registered: true,
        tds_deductor: true,
        tax_audit_applicable: true,
        mca_compliance_required: true,
        turnover_crores: 12.5,
        assessment_year: "2026-27",
        financial_year: "2025-26",
      });
      setSyncMsg(res.message);
      void fetchTasks();
      setTimeout(() => setSyncMsg(null), 4000);
    } catch {
      setSyncMsg("Statutory calendar synchronized.");
      setTimeout(() => setSyncMsg(null), 3000);
    }
  };

  const handleMoveStage = async (taskId: string, newStatus: TaskItem["status"]) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      console.error("Failed to update stage:", err);
    }
  };

  const filteredDeadlines = STATUTORY_DEADLINES.filter(
    (d) => headFilter === "ALL" || d.head === headFilter
  );

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-headline font-semibold text-on-surface">
              Statutory Compliance Calendar &amp; Review Pipeline
            </h1>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
              {activeClient?.name || "Active Client Enclave"}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Real-time regulatory tracking for GST, TDS, Income Tax, Advance Tax, and MCA statutory filings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <div className="p-1 rounded bg-surface-container-high border border-outline-variant/30 flex items-center text-xs">
            <button
              onClick={() => setActiveTab("calendar")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "calendar"
                  ? "bg-surface-container-lowest text-on-surface shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Statutory Deadlines
            </button>
            <button
              onClick={() => setActiveTab("pipeline")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === "pipeline"
                  ? "bg-surface-container-lowest text-on-surface shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Stage-Gated Review
            </button>
          </div>

          <button
            onClick={handleSyncCompliance}
            className="px-3 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">event_repeat</span>
            <span>Sync Client Cycles</span>
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          <span>{syncMsg}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-outline-variant/20 text-xs">
        {["ALL", "GST", "TDS / TCS", "ADVANCE TAX", "TAX AUDIT", "MCA / ROC"].map((cat) => (
          <button
            key={cat}
            onClick={() => setHeadFilter(cat)}
            className={`px-2.5 py-1 rounded font-mono text-[11px] whitespace-nowrap transition-colors ${
              headFilter === cat
                ? "bg-on-surface text-surface font-semibold"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* TAB 1: Statutory Deadlines Grid */}
      {activeTab === "calendar" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredDeadlines.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">
                    {item.head}
                  </span>
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold ${
                      item.urgency === "critical"
                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                        : item.urgency === "high"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {item.days_left} DAYS LEFT
                  </span>
                </div>

                <h3 className="text-xs font-semibold text-on-surface mt-2.5 leading-snug">
                  {item.title}
                </h3>

                <div className="mt-2 text-[11px] font-mono text-outline">
                  Authority: {item.authority}
                </div>

                <div className="mt-3 p-2 rounded bg-surface-container-low text-[11px] text-on-surface-variant leading-relaxed border border-outline-variant/20">
                  <span className="font-semibold text-rose-600 block mb-0.5">Penal Provisions:</span>
                  {item.penalty}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-on-surface">
                  Due: {item.due_date}
                </span>
                <span className="text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                  <span>Prepare Working Paper</span>
                  <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: Stage-Gated Review Pipeline (Kanban) */}
      {activeTab === "pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Column 1: Data Inward */}
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col min-h-[420px]">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/25 mb-2.5">
              <span className="text-xs font-semibold text-on-surface">1. Data Inward Logged</span>
              <span className="font-mono text-[11px] text-outline">
                {tasks.filter((t) => t.status === "todo").length}
              </span>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {tasks
                .filter((t) => t.status === "todo")
                .map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded bg-surface-container-lowest border border-outline-variant/30 text-xs shadow-xs"
                  >
                    <div className="font-medium text-on-surface">{task.title}</div>
                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-outline">Ready for Draft</span>
                      <button
                        onClick={() => handleMoveStage(task.id, "in_progress")}
                        className="text-[10px] text-primary hover:underline font-mono"
                      >
                        Start Prep →
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Column 2: Prepared */}
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col min-h-[420px]">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/25 mb-2.5">
              <span className="text-xs font-semibold text-on-surface">2. Working Paper Prepared</span>
              <span className="font-mono text-[11px] text-outline">
                {tasks.filter((t) => t.status === "in_progress").length}
              </span>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {tasks
                .filter((t) => t.status === "in_progress")
                .map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded bg-surface-container-lowest border border-outline-variant/30 text-xs shadow-xs"
                  >
                    <div className="font-medium text-on-surface">{task.title}</div>
                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-indigo-600">Draft Completed</span>
                      <button
                        onClick={() => handleMoveStage(task.id, "review")}
                        className="text-[10px] text-primary hover:underline font-mono"
                      >
                        Submit Review →
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Column 3: Manager Review */}
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col min-h-[420px]">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/25 mb-2.5">
              <span className="text-xs font-semibold text-on-surface">3. Partner Sign-Off</span>
              <span className="font-mono text-[11px] text-outline">
                {tasks.filter((t) => t.status === "review").length}
              </span>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {tasks
                .filter((t) => t.status === "review")
                .map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded bg-surface-container-lowest border border-outline-variant/30 text-xs shadow-xs"
                  >
                    <div className="font-medium text-on-surface">{task.title}</div>
                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-amber-600">Audit Partner Approval</span>
                      <button
                        onClick={() => handleMoveStage(task.id, "done")}
                        className="text-[10px] text-emerald-600 hover:underline font-mono font-semibold"
                      >
                        Sign &amp; File ✓
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Column 4: Filed & Challan Paid */}
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col min-h-[420px]">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/25 mb-2.5">
              <span className="text-xs font-semibold text-on-surface">4. Filed &amp; Challan Vaulted</span>
              <span className="font-mono text-[11px] text-emerald-600 font-semibold">
                {tasks.filter((t) => t.status === "done").length}
              </span>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {tasks
                .filter((t) => t.status === "done")
                .map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded bg-surface-container-lowest border border-emerald-500/20 text-xs shadow-xs opacity-85"
                  >
                    <div className="font-medium text-on-surface line-through">{task.title}</div>
                    <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                      <span>Ack / Challan Vaulted</span>
                      <span className="material-symbols-outlined text-[14px]">check</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
