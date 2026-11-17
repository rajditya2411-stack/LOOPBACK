"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type ViewMode = "kanban" | "list";

interface PracticeAreaItem {
  id: string;
  code: string;
  name: string;
  color: string;
}

interface LitigationDocket {
  id: string;
  name: string;
  practiceCode: string;
  description?: string;
}

interface MilestoneItem {
  id: string;
  title: string;
  description?: string | null;
  category?: string;
  status: string;
  progress: number;
  target_date?: string | null;
  practiceArea: string;
  docket: string;
  rawDescription: string;
}

interface KanbanTaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  due_date?: string | null;
  practiceArea: string;
  docket: string;
  rawDescription: string;
}

const DEFAULT_PRACTICE_AREAS: PracticeAreaItem[] = [
  { id: "pa-comm", code: "COMM-LIT", name: "Commercial Suits & Injunctions", color: "bg-primary" },
  { id: "pa-writ", code: "WRIT-HC", name: "High Court & Supreme Court Writs", color: "bg-tertiary" },
  { id: "pa-arb", code: "ARBITRATION", name: "Domestic & International Arbitration", color: "bg-primary-container" },
  { id: "pa-crim", code: "CRIM-DEFENSE", name: "Special Criminal Petitions & Bail", color: "bg-secondary" },
];

const DEFAULT_DOCKETS: LitigationDocket[] = [
  {
    id: "d-comm-105",
    name: "CS(COMM) 105/2026 Patent Injunction",
    practiceCode: "COMM-LIT",
    description: "Patent infringement suit before Single Judge Bench, Delhi High Court.",
  },
  {
    id: "d-writ-4120",
    name: "W.P.(C) 4120/2025 Tender Disqualification",
    practiceCode: "WRIT-HC",
    description: "Article 226 challenge against arbitrary tender rejection by public authority.",
  },
  {
    id: "d-arb-892",
    name: "ARB.P. 892/2024 Section 11 Referral",
    practiceCode: "ARBITRATION",
    description: "Petition for appointment of sole arbitrator under Section 11(6) of 1996 Act.",
  },
  {
    id: "d-crim-219",
    name: "CRL.A. 219/2024 Suspension of Sentence",
    practiceCode: "CRIM-DEFENSE",
    description: "Appellate bail and sentence suspension under Section 389 CrPC / 430 BNSS.",
  },
];

function parseDocketAndArea(raw?: string | null, fallbackArea = "COMM-LIT"): {
  practiceArea: string;
  docket: string;
  text: string;
} {
  if (!raw) return { practiceArea: fallbackArea, docket: "CS(COMM) 105/2026 Patent Injunction", text: "" };
  const match = raw.match(/^\[(.*?) \| (.*?)\] ([\s\S]*)$/);
  if (match) {
    return {
      practiceArea: match[1].trim() || fallbackArea,
      docket: match[2].trim() || "CS(COMM) 105/2026 Patent Injunction",
      text: match[3].trim(),
    };
  }
  return { practiceArea: fallbackArea, docket: "CS(COMM) 105/2026 Patent Injunction", text: raw };
}

export default function HearingsAndTasksPage() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [practiceAreas, setPracticeAreas] = useState<PracticeAreaItem[]>(DEFAULT_PRACTICE_AREAS);
  const [dockets, setDockets] = useState<LitigationDocket[]>(DEFAULT_DOCKETS);
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedDocket, setSelectedDocket] = useState<string>("all");

  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [tasks, setTasks] = useState<KanbanTaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Quick Add Task Modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<"todo" | "in_progress" | "review" | "done">("todo");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  // Load Real Data
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [gRes, tRes] = await Promise.all([
        api.get<any[]>("/goals").catch(() => []),
        api.get<any[]>("/tasks").catch(() => []),
      ]);

      const parsedMilestones: MilestoneItem[] = gRes.map((g) => {
        const parsed = parseDocketAndArea(g.description);
        return {
          id: g.id,
          title: g.title,
          description: g.description,
          progress: typeof g.progress === "number" ? g.progress : 0.0,
          status: g.status || "active",
          target_date: g.target_date,
          practiceArea: parsed.practiceArea,
          docket: parsed.docket,
          rawDescription: parsed.text,
        };
      });

      const parsedTasks: KanbanTaskItem[] = tRes.map((t) => {
        const parsed = parseDocketAndArea(t.description);
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          status: (t.status as any) || "todo",
          priority: (t.priority as any) || "medium",
          due_date: t.due_date,
          practiceArea: parsed.practiceArea,
          docket: parsed.docket,
          rawDescription: parsed.text,
        };
      });

      setMilestones(parsedMilestones);
      setTasks(parsedTasks);
    } catch (err) {
      console.error("Failed to load court tasks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update Task Status (Drag or Drop / Click)
  const handleTaskMove = async (taskId: string, newStatus: "todo" | "in_progress" | "review" | "done") => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
    } catch {
      loadData();
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Delete this court hearing or filing task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await api.delete(`/tasks/${taskId}`);
    } catch {
      loadData();
    }
  };

  // Add Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const created = await api.post<any>("/tasks", {
        title: newTaskTitle.trim(),
        status: newTaskStatus,
        priority: newTaskPriority,
        description: `[${selectedArea !== "all" ? selectedArea : "COMM-LIT"} | ${selectedDocket !== "all" ? selectedDocket : "CS(COMM) 105/2026 Patent Injunction"}] Scheduled hearing / filing`,
      });
      setTasks((prev) => [
        {
          id: created.id,
          title: created.title,
          status: created.status,
          priority: created.priority,
          practiceArea: selectedArea !== "all" ? selectedArea : "COMM-LIT",
          docket: selectedDocket !== "all" ? selectedDocket : "CS(COMM) 105/2026",
          rawDescription: created.description || "",
        },
        ...prev,
      ]);
      setShowTaskModal(false);
      setNewTaskTitle("");
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  // Seed Sample Legal Dockets if empty
  const handleSeedSampleDockets = async () => {
    try {
      setIsLoading(true);
      await api.post("/law/cases/generate-schedule", {
        matter_name: "Apex Logistics v. Union of India",
        case_type: "Commercial Suit",
        court_forum: "High Court of Delhi",
        filing_date: "2026-11-18",
        client_name: "Apex Logistics Ltd",
      });
      await loadData();
    } catch (err) {
      console.error("Failed to seed sample dockets:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered Tasks
  const filteredTasks = tasks.filter((t) => {
    const matchArea = selectedArea === "all" || t.practiceArea === selectedArea;
    const matchDocket = selectedDocket === "all" || t.docket === selectedDocket;
    return matchArea && matchDocket;
  });

  const columns: { id: "todo" | "in_progress" | "review" | "done"; title: string; subtitle: string }[] = [
    { id: "todo", title: "To File & Registry Scrutiny", subtitle: "Caveat, court fees, defect clearing" },
    { id: "in_progress", title: "In Preparation & Drafting", subtitle: "Written statement, replication, evidence" },
    { id: "review", title: "Counsel Review & Settled", subtitle: "Senior Advocate briefing & conference" },
    { id: "done", title: "Argued & Disposed", subtitle: "Orders pronounced or taken on record" },
  ];

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">gavel</span>
              <h1 className="font-headline text-headline-md text-on-surface">
                Court Hearings &amp; Procedural Filings
              </h1>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Track tactical filing deadlines, summons returnable dates, and Senior Counsel court appearances across high court dockets.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTaskModal(true)}
              className="px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>+ Schedule Filing</span>
            </button>
          </div>
        </div>

        {/* Practice Area Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-on-surface-variant mr-1">Practice Area:</span>
            <button
              type="button"
              onClick={() => setSelectedArea("all")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                selectedArea === "all"
                  ? "bg-primary text-white"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              All Practice Areas
            </button>
            {practiceAreas.map((pa) => (
              <button
                key={pa.id}
                type="button"
                onClick={() => setSelectedArea(pa.code)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  selectedArea === pa.code
                    ? "bg-primary text-white"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {pa.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "kanban" ? "list" : "kanban")}
              className="px-2.5 py-1 rounded border border-outline-variant/40 bg-surface-container-low hover:bg-surface-container text-xs text-on-surface font-medium cursor-pointer"
            >
              {viewMode === "kanban" ? "Switch to List View" : "Switch to Kanban"}
            </button>
          </div>
        </div>

        {/* Procedural Milestones Ribbon */}
        {milestones.length > 0 && (
          <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[16px]">flag</span>
                <span>Procedural Milestones &amp; Trial Stages</span>
              </span>
              <span className="text-[11px] text-outline">{milestones.length} active stages</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {milestones.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-lg border border-outline-variant/30 bg-surface-container-low space-y-2"
                >
                  <div className="text-xs font-semibold text-on-surface truncate">{m.title}</div>
                  <div className="flex items-center justify-between text-[11px] text-outline">
                    <span>Progress</span>
                    <span>{Math.round(m.progress * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.max(5, m.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4-Column Kanban Board */}
        {viewMode === "kanban" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);
              return (
                <div
                  key={col.id}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md flex flex-col min-h-[500px] shadow-xs"
                >
                  {/* Column Header */}
                  <div className="pb-space-sm border-b border-outline-variant/20 mb-3 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-on-surface">{col.title}</span>
                      <span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface font-mono-sm text-[11px] flex items-center justify-center font-bold">
                        {colTasks.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-outline">{col.subtitle}</p>
                  </div>

                  {/* Tasks List */}
                  <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {colTasks.length === 0 ? (
                      <div className="p-6 text-center text-[11px] text-on-surface-variant/50 border border-dashed border-outline-variant/30 rounded-lg">
                        No filings in this stage
                      </div>
                    ) : (
                      colTasks.map((task) => (
                        <div
                          key={task.id}
                          className="p-3 rounded-lg border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container shadow-2xs space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="text-xs font-semibold text-on-surface leading-tight">
                              {task.title}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-mono-sm shrink-0 ${
                              task.priority === "urgent"
                                ? "bg-error/10 text-error border border-error/20"
                                : task.priority === "high"
                                ? "bg-amber-500/10 text-amber-700"
                                : "bg-surface-container-high text-on-surface-variant"
                            }`}>
                              {task.priority}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-outline-variant/10 text-[10px] text-outline">
                            <button
                              type="button"
                              onClick={() => router.push(`/chat?topic=${encodeURIComponent(task.title)}`)}
                              className="text-primary hover:underline font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <span>✦ Advisory</span>
                            </button>

                            <div className="flex items-center gap-1">
                              {col.id !== "done" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = col.id === "todo" ? "in_progress" : col.id === "in_progress" ? "review" : "done";
                                    handleTaskMove(task.id, next);
                                  }}
                                  className="text-outline hover:text-primary px-1 cursor-pointer"
                                  title="Advance stage"
                                >
                                  →
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-outline hover:text-error px-1 cursor-pointer"
                                title="Delete"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State Seed */}
        {filteredTasks.length === 0 && !isLoading && (
          <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-3">
            <span className="material-symbols-outlined text-[32px] text-primary">gavel</span>
            <div className="text-xs text-on-surface font-medium">No Court Hearings or Filings Scheduled</div>
            <p className="text-[11px] text-outline max-w-sm mx-auto">
              Schedule tactical litigation filings or auto-generate complete procedural stages using the legal scheduler.
            </p>
            <button
              type="button"
              onClick={handleSeedSampleDockets}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">sync</span>
              <span>Load Sample Dockets &amp; Hearing Schedule</span>
            </button>
          </div>
        )}

        {/* Schedule Filing Modal */}
        {showTaskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/40 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <h3 className="font-headline text-headline-sm text-on-surface">
                  Schedule Court Filing / Hearing
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Task / Filing Description *
                  </label>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="e.g. File 120-Day Written Statement with Statement of Truth"
                    required
                    className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Initial Stage
                    </label>
                    <select
                      value={newTaskStatus}
                      onChange={(e) => setNewTaskStatus(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low text-on-surface"
                    >
                      <option value="todo">To File (Registry)</option>
                      <option value="in_progress">In Drafting</option>
                      <option value="review">Counsel Review</option>
                      <option value="done">Argued / Disposed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface mb-1">
                      Limitation Priority
                    </label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low text-on-surface"
                    >
                      <option value="low">Routine</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent Limitation</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTaskModal(false)}
                    className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs"
                  >
                    Add to Board
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
