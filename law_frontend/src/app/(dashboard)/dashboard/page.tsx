"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";

type VelocityMode = "sessions" | "filings" | "precedents";

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string | null;
}

interface GoalItem {
  id: string;
  title: string;
  description?: string | null;
  progress: number;
  target_date?: string | null;
}

interface DocItem {
  id: string;
  title: string;
  file_size: number;
}

interface CauseListItem {
  id: string;
  item_number: number;
  case_number: string;
  parties: string;
  court_name: string;
  bench: string;
  court_room: string;
  stage: string;
  session: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Billable Hours & Court Session Timer
  const [timerActive, setTimerActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Velocity mode
  const [velocityMode, setVelocityMode] = useState<VelocityMode>("sessions");

  // Real Backend Data State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [causeList, setCauseList] = useState<CauseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Quick Add Hearing / Filing Task
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<"low" | "medium" | "high" | "urgent">("high");

  // Upload Status
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Load Real Data on Mount
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [tRes, gRes, dRes, clRes] = await Promise.allSettled([
          api.get<TaskItem[]>("/tasks"),
          api.get<GoalItem[]>("/goals"),
          api.get<DocItem[]>("/documents"),
          api.get<CauseListItem[]>("/law/causelist"),
        ]);

        if (!mounted) return;

        if (tRes.status === "fulfilled" && Array.isArray(tRes.value)) {
          setTasks(tRes.value);
        }
        if (gRes.status === "fulfilled" && Array.isArray(gRes.value)) {
          setGoals(gRes.value);
        }
        if (dRes.status === "fulfilled" && Array.isArray(dRes.value)) {
          setDocuments(dRes.value);
        }
        if (clRes.status === "fulfilled" && Array.isArray(clRes.value)) {
          setCauseList(clRes.value);
        }
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  // Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerActive && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            setSessionCompleted(true);
            return 25 * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive, secondsLeft]);

  const toggleTimer = () => {
    if (sessionCompleted) {
      setSessionCompleted(false);
      setSecondsLeft(25 * 60);
      setTimerActive(true);
      return;
    }
    setTimerActive(!timerActive);
  };

  const formatTimer = () => {
    if (sessionCompleted) return "Court Preparation Session Complete!";
    if (timerActive) {
      const mins = Math.floor(secondsLeft / 60);
      const secs = secondsLeft % 60;
      return `${mins}:${secs < 10 ? "0" : ""}${secs} Remaining`;
    }
    return "Start Billable Court Session (25m)";
  };

  const handleTaskToggle = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "done" ? "todo" : "done";
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: nextStatus } : t))
    );
    try {
      await api.put(`/tasks/${id}`, { status: nextStatus });
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: currentStatus } : t))
      );
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      const newTask = await api.post<TaskItem>("/tasks", {
        title: quickTitle.trim(),
        priority: quickPriority,
        status: "todo",
      });
      setTasks((prev) => [newTask, ...prev]);
      setQuickTitle("");
      setShowQuickAdd(false);
    } catch (err) {
      console.error("Failed to create hearing task:", err);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("Indexing pleading into encrypted vault...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadedDoc = await api.upload<DocItem>("/documents/upload", formData);
      setDocuments((prev) => [uploadedDoc, ...prev]);
      setUploadStatus("Pleading indexed successfully.");
      setTimeout(() => setUploadStatus(null), 3500);
    } catch {
      setUploadStatus("Upload failed. Ensure backend service is reachable.");
      setTimeout(() => setUploadStatus(null), 3500);
    }
  };

  // Derive counts
  const pendingTasks = tasks.filter((t) => t.status !== "done");
  const urgentTasks = pendingTasks.filter((t) => t.priority === "urgent" || t.priority === "high");
  const listedTodayCount = causeList.length;

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Hero Section */}
        <div className="p-space-lg rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-outline">
                Chambers Session · High Court &amp; Commercial Benches
              </span>
            </div>
            <h1 className="font-headline text-headline-lg text-on-surface">
              Welcome, {user?.full_name || "Senior Advocate"}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              You have <span className="font-semibold text-primary">{urgentTasks.length} urgent hearings and filing deadlines</span> pending, and <span className="font-semibold text-on-surface">{listedTodayCount} matters listed on active cause lists</span>.
            </p>

            {urgentTasks.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-2">
                {urgentTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => router.push("/tasks")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-error/10 hover:bg-error/20 border border-error/20 text-xs font-medium text-error transition-colors cursor-pointer text-left"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0"></span>
                    <span className="truncate max-w-[260px]">{task.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={toggleTimer}
              className={`px-3 py-2 rounded-lg font-medium text-xs flex items-center gap-2 border transition-colors cursor-pointer shadow-xs ${
                timerActive
                  ? "bg-primary text-white border-primary"
                  : sessionCompleted
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-surface-container-low hover:bg-surface-container border-outline-variant/40 text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">
                {sessionCompleted ? "check_circle" : timerActive ? "timer" : "hourglass_top"}
              </span>
              <span>{formatTimer()}</span>
            </button>

            <Link
              href="/tasks"
              className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-medium text-xs border border-outline-variant/30 flex items-center gap-1.5 transition-colors"
            >
              <span>Court Board</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>

            <Link
              href="/limitation"
              className="px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">schedule</span>
              <span>Limitation Calc</span>
            </Link>
          </div>
        </div>

        {/* 4 KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">Cause List Matters</span>
              <span className="material-symbols-outlined text-[18px] text-primary">event_note</span>
            </div>
            <div className="text-headline-md font-bold text-on-surface">{causeList.length}</div>
            <p className="text-[11px] text-outline">Active court rooms tracked</p>
          </div>

          <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">Hearings &amp; Filings</span>
              <span className="material-symbols-outlined text-[18px] text-amber-600">gavel</span>
            </div>
            <div className="text-headline-md font-bold text-on-surface">{pendingTasks.length}</div>
            <p className="text-[11px] text-outline">{urgentTasks.length} critical / high priority</p>
          </div>

          <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">Procedural Milestones</span>
              <span className="material-symbols-outlined text-[18px] text-emerald-600">flag</span>
            </div>
            <div className="text-headline-md font-bold text-on-surface">{goals.length}</div>
            <p className="text-[11px] text-outline">Across all active matters</p>
          </div>

          <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">Pleadings Vault</span>
              <span className="material-symbols-outlined text-[18px] text-indigo-600">description</span>
            </div>
            <div className="text-headline-md font-bold text-on-surface">{documents.length}</div>
            <p className="text-[11px] text-outline">Indexed for RAG citations</p>
          </div>
        </div>

        {/* Live Cause List Strip */}
        <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">gavel</span>
              <h2 className="font-headline text-headline-sm text-on-surface">
                Today&apos;s High Court &amp; Commercial Cause List
              </h2>
            </div>
            <Link
              href="/causelist"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              <span>View Full Hearing Board</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant font-medium">
                  <th className="py-2 px-3">Item #</th>
                  <th className="py-2 px-3">Case Number</th>
                  <th className="py-2 px-3">Parties</th>
                  <th className="py-2 px-3">Court / Bench</th>
                  <th className="py-2 px-3">Hearing Stage</th>
                  <th className="py-2 px-3">Session</th>
                  <th className="py-2 px-3 text-right">Live Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {causeList.slice(0, 4).map((item) => (
                  <tr key={item.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 font-mono-md text-primary font-semibold">#{item.item_number}</td>
                    <td className="py-2.5 px-3 font-medium text-on-surface whitespace-nowrap">{item.case_number}</td>
                    <td className="py-2.5 px-3 text-on-surface-variant max-w-[240px] truncate">{item.parties}</td>
                    <td className="py-2.5 px-3 text-on-surface-variant">{item.court_room}</td>
                    <td className="py-2.5 px-3 text-on-surface">{item.stage}</td>
                    <td className="py-2.5 px-3 text-outline">{item.session}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                        item.status === "Item in Progress"
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                          : item.status === "Next Item"
                          ? "bg-amber-500/10 text-amber-600 border border-amber-500/30"
                          : item.status === "Heard & Reserved"
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Two-Column Workspace Layout: Hearings vs Evidence Vault */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
          {/* Urgent Procedural Tasks & Hearings */}
          <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>
                  <h3 className="font-headline text-headline-sm text-on-surface">
                    Hearings &amp; Statutory Filings
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(!showQuickAdd)}
                  className="px-2.5 py-1 rounded bg-surface-container-low hover:bg-surface-container text-xs font-medium text-primary border border-outline-variant/30 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  <span>+ Quick Add</span>
                </button>
              </div>

              {/* Quick Add Form */}
              {showQuickAdd && (
                <form onSubmit={handleQuickAdd} className="mt-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 space-y-2">
                  <input
                    type="text"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="e.g. File Caveat in Delhi High Court / Written Statement"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-lowest focus:outline-none focus:border-primary"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <select
                      value={quickPriority}
                      onChange={(e) => setQuickPriority(e.target.value as any)}
                      className="px-2 py-1 text-xs rounded border border-outline-variant/40 bg-surface-container-lowest text-on-surface"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent Limitation</option>
                    </select>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowQuickAdd(false)}
                        className="px-2.5 py-1 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 rounded bg-primary text-white text-xs font-medium cursor-pointer hover:bg-primary/90"
                      >
                        Add Task
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="mt-3 divide-y divide-outline-variant/20">
                {tasks.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-4 text-center">
                    No active tasks. Use + Quick Add or launch the Court Board to schedule filings.
                  </p>
                ) : (
                  tasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="py-2.5 flex items-center justify-between gap-3 hover:bg-surface-container-low px-1 rounded transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleTaskToggle(task.id, task.status)}
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                            task.status === "done"
                              ? "bg-primary border-primary text-white"
                              : "border-outline hover:border-primary"
                          }`}
                        >
                          {task.status === "done" && (
                            <span className="material-symbols-outlined text-[13px]">check</span>
                          )}
                        </button>
                        <span
                          className={`text-xs truncate ${
                            task.status === "done"
                              ? "line-through text-outline"
                              : "text-on-surface font-medium"
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono-sm shrink-0 ${
                        task.priority === "urgent"
                          ? "bg-error/10 text-error border border-error/20"
                          : task.priority === "high"
                          ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-space-md border-t border-outline-variant/20 mt-4">
              <Link
                href="/tasks"
                className="w-full py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-medium text-xs flex items-center justify-center gap-1 transition-colors"
              >
                <span>Manage 4-Stage Procedural Board</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Pleadings Vault & Quick Upload */}
          <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">folder_open</span>
                  <h3 className="font-headline text-headline-sm text-on-surface">
                    Pleadings, Briefs &amp; Evidence
                  </h3>
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.txt"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-surface-container-low hover:bg-surface-container text-xs font-medium text-primary border border-outline-variant/30 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">upload_file</span>
                    <span>Upload Brief</span>
                  </button>
                </div>
              </div>

              {uploadStatus && (
                <div className="mt-2 p-2 rounded bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                  {uploadStatus}
                </div>
              )}

              <div className="mt-3 divide-y divide-outline-variant/20">
                {documents.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-4 text-center">
                    No pleadings uploaded. Upload case briefs, affidavits, or contracts to enable RAG.
                  </p>
                ) : (
                  documents.slice(0, 5).map((doc) => (
                    <div
                      key={doc.id}
                      className="py-2.5 flex items-center justify-between gap-3 hover:bg-surface-container-low px-1 rounded transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
                          description
                        </span>
                        <span className="text-xs text-on-surface font-medium truncate">
                          {doc.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono-sm text-[10px] text-outline">
                          {Math.round(doc.file_size / 1024)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => router.push(`/documents/${doc.id}`)}
                          className="text-[11px] text-primary hover:underline cursor-pointer"
                        >
                          Examine →
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-space-md border-t border-outline-variant/20 mt-4 flex items-center justify-between">
              <Link
                href="/documents"
                className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
              >
                <span>Browse Pleadings Library</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
              <Link
                href="/chat"
                className="text-xs text-on-surface-variant hover:text-on-surface font-medium flex items-center gap-1"
              >
                <span>Launch Legal Advisory Copilot</span>
                <span className="material-symbols-outlined text-[14px]">chat</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
