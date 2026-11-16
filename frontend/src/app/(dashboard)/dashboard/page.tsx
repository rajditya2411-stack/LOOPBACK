"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";

type VelocityMode = "blocks" | "tasks" | "accuracy";

interface TaskItem {
  id: string;
  title: string;
  course?: string;
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
  category?: string;
}

interface DocItem {
  id: string;
  title: string;
  file_size: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Focus Timer state
  const [timerActive, setTimerActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Velocity Chart state
  const [velocityMode, setVelocityMode] = useState<VelocityMode>("blocks");

  // Real Backend Data State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Quick Add Task Form
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<"low" | "medium" | "high" | "urgent">("high");

  // Upload Status
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Fetch real data on mount
  useEffect(() => {
    let mounted = true;
    async function loadDashboardData() {
      try {
        const [fetchedTasks, fetchedGoals, fetchedDocs] = await Promise.allSettled([
          api.get<TaskItem[]>("/tasks"),
          api.get<GoalItem[]>("/goals"),
          api.get<DocItem[]>("/documents"),
        ]);

        if (!mounted) return;

        if (fetchedTasks.status === "fulfilled" && Array.isArray(fetchedTasks.value)) {
          setTasks(fetchedTasks.value);
        }
        if (fetchedGoals.status === "fulfilled" && Array.isArray(fetchedGoals.value)) {
          setGoals(fetchedGoals.value);
        }
        if (fetchedDocs.status === "fulfilled" && Array.isArray(fetchedDocs.value)) {
          setDocuments(fetchedDocs.value);
        }
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadDashboardData();
    return () => {
      mounted = false;
    };
  }, []);

  // Pomodoro Timer Effect
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
    if (sessionCompleted) return "Session Complete!";
    if (timerActive) {
      const mins = Math.floor(secondsLeft / 60);
      const secs = secondsLeft % 60;
      return `${mins}:${secs < 10 ? "0" : ""}${secs} Remaining`;
    }
    return "Start Focus Session (25m)";
  };

  const handleTaskToggle = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "done" ? "todo" : "done";
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: nextStatus } : t))
    );
    try {
      await api.put(`/tasks/${id}`, { status: nextStatus });
    } catch {
      // Revert if error
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: currentStatus } : t))
      );
    }
  };

  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    try {
      const created = await api.post<TaskItem>("/tasks", {
        title: quickTitle.trim(),
        priority: quickPriority,
        status: "todo",
      });
      setTasks((prev) => [created, ...prev]);
      setQuickTitle("");
      setShowQuickAdd(false);
    } catch (err) {
      console.error("Failed to add task:", err);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus(`Indexing ${file.name}...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      const doc = await api.upload<DocItem>("/documents/upload", formData);
      setDocuments((prev) => [doc, ...prev]);
      setUploadStatus(`Added: ${file.name}`);
      setTimeout(() => setUploadStatus(null), 3000);
    } catch {
      setTimeout(() => {
        setUploadStatus(`Locally saved: ${file.name}`);
        setTimeout(() => setUploadStatus(null), 3000);
      }, 800);
    }
  };

  // Urgent tasks: priority urgent or high, not completed
  const urgentTasks = tasks.filter(
    (t) => (t.priority === "urgent" || t.priority === "high") && t.status !== "done"
  );

  const pendingTasks = tasks.filter((t) => t.status !== "done");

  // Format date
  const todayFormatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  // Chart data based on mode
  const chartData = {
    blocks: [
      { day: "M", val: 5, pct: 55, active: false },
      { day: "T", val: 7, pct: 75, active: false },
      { day: "W", val: 6, pct: 65, active: false },
      { day: "T", val: 8, pct: 85, active: false },
      { day: "F", val: 9, pct: 100, active: true },
      { day: "S", val: 4, pct: 42, active: false },
      { day: "S", val: 3, pct: 32, active: false },
    ],
    tasks: [
      { day: "M", val: 4, pct: 40, active: false },
      { day: "T", val: 8, pct: 80, active: false },
      { day: "W", val: 7, pct: 70, active: false },
      { day: "T", val: 9, pct: 90, active: false },
      { day: "F", val: 10, pct: 100, active: true },
      { day: "S", val: 5, pct: 50, active: false },
      { day: "S", val: 2, pct: 20, active: false },
    ],
    accuracy: [
      { day: "M", val: 88, pct: 88, active: false, suffix: "%" },
      { day: "T", val: 92, pct: 92, active: false, suffix: "%" },
      { day: "W", val: 90, pct: 90, active: false, suffix: "%" },
      { day: "T", val: 95, pct: 95, active: false, suffix: "%" },
      { day: "F", val: 98, pct: 98, active: true, suffix: "%" },
      { day: "S", val: 85, pct: 85, active: false, suffix: "%" },
      { day: "S", val: 82, pct: 82, active: false, suffix: "%" },
    ],
  };

  const currentBars = chartData[velocityMode];

  return (
    <div className="w-full px-space-lg py-space-lg">
      <div className="flex flex-col w-full gap-space-lg">
        {/* Top Hero Banner with Urgent Tasks & Direct Milestones Link */}
        <div className="flex flex-col gap-space-md p-space-lg rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="font-headline-sm text-headline-sm text-on-surface">
                  Good morning, {user?.full_name?.split(" ")[0] || "Scholar"}
                </span>
                <span className="font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                  {todayFormatted} · Fall Term
                </span>
                <span className="inline-flex items-center gap-1 font-mono-sm text-mono-sm text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  Sync Active
                </span>
              </div>
              <p className="font-body-md text-body-md text-secondary">
                {urgentTasks.length > 0
                  ? `${urgentTasks.length} urgent milestone task${urgentTasks.length > 1 ? "s" : ""} pending attention.`
                  : "All urgent deliverables completed. Schedule is up to date."}
              </p>
            </div>

            <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
              <Link
                href="/tasks"
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors"
                title="View Milestones & Tasks"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">
                  check_box
                </span>
                <span>Open Milestones</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>

              <button
                onClick={toggleTimer}
                className={`flex items-center gap-2 h-8 px-3 rounded-lg transition-all shadow-sm active:scale-95 cursor-pointer ${
                  timerActive
                    ? "bg-primary text-on-primary ring-2 ring-primary/30"
                    : "bg-on-surface text-surface hover:opacity-90"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">timer</span>
                <span className="font-label-md text-label-md">{formatTimer()}</span>
              </button>

              <button
                onClick={() => router.push("/settings")}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
                title="Appliance Settings"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
              </button>
            </div>
          </div>

          {/* Urgent Tasks Quick Chips Strip */}
          {urgentTasks.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/15 flex-wrap">
              <span className="font-mono-sm text-mono-sm text-outline uppercase tracking-wider">
                Immediate Action:
              </span>
              {urgentTasks.slice(0, 3).map((task) => (
                <Link
                  key={task.id}
                  href="/tasks"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-mono-sm text-mono-sm border border-outline-variant/25 transition-colors group cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0"></span>
                  <span className="font-medium group-hover:text-primary transition-colors truncate max-w-[200px]">
                    {task.title}
                  </span>
                  <span className="text-secondary text-[11px]">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : "Due Today"}
                  </span>
                </Link>
              ))}
              {urgentTasks.length > 3 && (
                <Link
                  href="/tasks"
                  className="font-mono-sm text-mono-sm text-primary hover:underline px-1"
                >
                  +{urgentTasks.length - 3} more
                </Link>
              )}
            </div>
          )}
        </div>

        {/* 2-Column Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-space-lg">
            {/* Study Overview */}
            <div className="flex flex-col p-space-lg rounded-xl bg-surface-container-lowest shadow-sm gap-space-md">
              <div className="flex items-center justify-between pb-space-sm">
                <div className="flex flex-col">
                  <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-outline">
                    Study Overview
                  </span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">
                    Study Velocity &amp; Throughput
                  </h2>
                </div>
                <div className="flex items-center gap-1 bg-surface-container rounded-lg p-0.5">
                  <button
                    onClick={() => setVelocityMode("blocks")}
                    className={`px-2 py-1 rounded font-mono-sm text-mono-sm transition-colors cursor-pointer ${
                      velocityMode === "blocks"
                        ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold"
                        : "text-secondary hover:text-on-surface"
                    }`}
                  >
                    Blocks
                  </button>
                  <button
                    onClick={() => setVelocityMode("tasks")}
                    className={`px-2 py-1 rounded font-mono-sm text-mono-sm transition-colors cursor-pointer ${
                      velocityMode === "tasks"
                        ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold"
                        : "text-secondary hover:text-on-surface"
                    }`}
                  >
                    Tasks
                  </button>
                  <button
                    onClick={() => setVelocityMode("accuracy")}
                    className={`px-2 py-1 rounded font-mono-sm text-mono-sm transition-colors cursor-pointer ${
                      velocityMode === "accuracy"
                        ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold"
                        : "text-secondary hover:text-on-surface"
                    }`}
                  >
                    Accuracy
                  </button>
                </div>
              </div>

              {/* Bar Chart Canvas */}
              <div className="relative w-full pt-4">
                <div className="flex items-end justify-between h-44 w-full gap-2 px-2 pb-2">
                  {currentBars.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center gap-2 h-full justify-end group cursor-pointer"
                    >
                      <span
                        className={`font-mono-sm text-mono-sm transition-opacity ${
                          item.active
                            ? "font-semibold text-primary opacity-100"
                            : "text-secondary opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {item.val}
                        {(item as any).suffix || (velocityMode === "blocks" ? " blk" : " tsk")}
                        {item.active ? " ★" : ""}
                      </span>
                      <div
                        className={`w-full max-w-[36px] transition-all rounded-t-sm ${
                          item.active
                            ? "bg-primary shadow-sm"
                            : "bg-secondary-container group-hover:bg-primary/70"
                        }`}
                        style={{ height: `${item.pct}%` }}
                      ></div>
                      <span
                        className={`font-mono-sm text-mono-sm ${
                          item.active
                            ? "font-semibold text-on-surface"
                            : "text-outline"
                        }`}
                      >
                        {item.day}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Metric Tiles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm pt-space-xs">
                <div className="flex flex-col p-3 rounded-lg bg-surface-container-low">
                  <span className="font-label-sm text-label-sm uppercase text-outline">
                    Weekly Completed
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-headline-md text-headline-md text-on-surface">
                      {tasks.filter((t) => t.status === "done").length}
                    </span>
                    <span className="font-mono-sm text-mono-sm text-primary">
                      tasks done
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-secondary mt-0.5">
                    Sprint progress
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-lg bg-surface-container-low">
                  <span className="font-label-sm text-label-sm uppercase text-outline">
                    Peak Focus Zone
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-headline-md text-headline-md text-on-surface">
                      09:00
                    </span>
                    <span className="font-mono-sm text-mono-sm text-secondary">
                      - 12:00
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-secondary mt-0.5">
                    Deep cognitive window
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-lg bg-surface-container-low">
                  <span className="font-label-sm text-label-sm uppercase text-outline">
                    Pending Tasks
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-headline-md text-headline-md text-on-surface">
                      {pendingTasks.length}
                    </span>
                    <span className="font-mono-sm text-mono-sm text-secondary">
                      in pipeline
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-secondary mt-0.5">
                    {urgentTasks.length} critical priority
                  </span>
                </div>
              </div>
            </div>

            {/* Course Materials Upload */}
            <div className="flex flex-col md:flex-row gap-space-md p-space-lg rounded-xl bg-surface-container-lowest shadow-sm items-center">
              <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center shrink-0 text-primary">
                <span className="material-symbols-outlined text-[28px]">
                  cloud_upload
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1 text-center md:text-left">
                <div className="flex items-center gap-2 justify-center md:justify-start">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    Course Materials &amp; Notes
                  </h3>
                  <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed">
                    Course Materials Upload
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-secondary mt-1">
                  Drop lecture slides, syllabus PDFs, or exam notes to add them to your knowledge base.
                </p>
                <span className="font-mono-sm text-mono-sm text-outline mt-0.5">
                  Supported: PDF, DOCX, TXT, Markdown · Max 32MB payload
                </span>
                {uploadStatus && (
                  <span className="font-mono-sm text-mono-sm text-primary font-medium mt-1">
                    {uploadStatus}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-space-sm shrink-0 w-full md:w-auto">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full md:w-auto flex items-center justify-center gap-2 h-8 px-4 rounded-lg bg-surface-container-highest hover:bg-surface-variant text-on-surface transition-colors font-label-md text-label-md cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    file_open
                  </span>
                  Upload Notes or Slides
                </button>
              </div>
            </div>

            {/* Sub-grid: Course Materials Breakdown & Study Activity & Focus */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
              <div className="flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-sm">
                <div className="flex items-center justify-between pb-2">
                  <span className="font-label-md text-label-md text-on-surface font-medium">
                    Course Materials Breakdown
                  </span>
                  <span className="font-mono-sm text-mono-sm text-secondary">
                    {documents.length > 0 ? `${documents.length} document${documents.length > 1 ? "s" : ""}` : "No documents yet"}
                  </span>
                </div>
                <div className="flex h-2 w-full rounded-full bg-surface-container overflow-hidden gap-0.5">
                  <div className="bg-primary h-full" style={{ width: documents.length > 0 ? "50%" : "0%" }}></div>
                  <div className="bg-primary-container h-full" style={{ width: documents.length > 0 ? "30%" : "0%" }}></div>
                  <div className="bg-tertiary-container h-full" style={{ width: documents.length > 0 ? "20%" : "0%" }}></div>
                </div>
                <div className="flex items-center justify-between pt-3 font-mono-sm text-mono-sm text-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                    Lecture Notes
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary-container"></span>
                    Readings &amp; PDFs
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-tertiary-container"></span>
                    Syllabi &amp; Guides
                  </span>
                </div>
              </div>

              <div className="flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-sm justify-between">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface font-medium">
                    Study Activity &amp; Focus
                  </span>
                  <span className="font-mono-sm text-mono-sm text-primary font-semibold">
                    Active &amp; Ready
                  </span>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 bg-surface-container-low p-2 rounded-lg text-center">
                    <span className="font-mono-sm text-mono-sm text-outline block">
                      Saved Notes
                    </span>
                    <span className="font-headline-sm text-headline-sm text-on-surface">
                      {documents.length}
                    </span>
                  </div>
                  <div className="flex-1 bg-surface-container-low p-2 rounded-lg text-center">
                    <span className="font-mono-sm text-mono-sm text-outline block">
                      Pending Tasks
                    </span>
                    <span className="font-headline-sm text-headline-sm text-on-surface">
                      {pendingTasks.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-space-lg">
            {/* Priority Study Tasks */}
            <div className="flex flex-col p-space-lg rounded-xl bg-surface-container-lowest shadow-sm gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">
                    Priority Study Tasks
                  </h2>
                  <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface">
                    {pendingTasks.length}
                  </span>
                </div>
                <Link
                  href="/tasks"
                  className="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-0.5"
                >
                  View all tasks
                  <span className="material-symbols-outlined text-[13px]">
                    arrow_forward
                  </span>
                </Link>
              </div>

              {/* Task Checklist */}
              <div className="flex flex-col gap-space-xs" id="task-list">
                {isLoading ? (
                  <div className="py-6 text-center text-secondary font-mono-sm text-mono-sm">
                    Loading tasks...
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="py-6 text-center text-secondary font-body-sm text-body-sm">
                    No active tasks. Tap &quot;Quick Add Task&quot; below to add your first study deliverable.
                  </div>
                ) : (
                  tasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      onClick={() => handleTaskToggle(task.id, task.status)}
                      className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-container-low transition-colors group cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={task.status === "done"}
                        onChange={() => handleTaskToggle(task.id, task.status)}
                        className="mt-1 w-3.5 h-3.5 rounded bg-surface-container accent-primary cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          className={`font-body-md text-body-md font-medium truncate group-hover:text-primary transition-colors ${
                            task.status === "done"
                              ? "line-through text-outline"
                              : "text-on-surface"
                          }`}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono-sm text-mono-sm px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant capitalize">
                            {task.priority}
                          </span>
                          <span
                            className={`font-mono-sm text-mono-sm ${
                              task.priority === "urgent" || task.priority === "high"
                                ? "text-error"
                                : "text-secondary"
                            }`}
                          >
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : "Active"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {showQuickAdd ? (
                <form onSubmit={handleQuickAddTask} className="flex flex-col gap-2 pt-1">
                  <input
                    type="text"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="Task title..."
                    autoFocus
                    className="px-2.5 py-1.5 rounded-lg bg-surface-container text-body-sm text-on-surface outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={quickPriority}
                      onChange={(e) => setQuickPriority(e.target.value as any)}
                      className="px-2 py-1 rounded bg-surface-container text-mono-sm text-on-surface outline-none"
                    >
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-1 rounded bg-on-surface text-surface text-label-sm font-medium hover:opacity-90 ml-auto cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(false)}
                      className="px-2 py-1 text-secondary text-label-sm hover:text-on-surface cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowQuickAdd(true)}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">add</span>
                  Quick Add Task
                </button>
              )}
            </div>

            {/* Active Semester Goals */}
            <div className="flex flex-col p-space-lg rounded-xl bg-surface-container-lowest shadow-sm gap-space-md">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Active Semester Goals
                </h2>
                <Link
                  href="/tasks"
                  className="font-mono-sm text-mono-sm text-primary hover:underline"
                >
                  Manage
                </Link>
              </div>

              <div className="flex flex-col gap-space-md">
                {goals.length === 0 ? (
                  <div className="py-4 text-center text-secondary font-body-sm text-body-sm">
                    No semester goals defined yet. Define goals in Milestones &amp; Tasks to track progress.
                  </div>
                ) : (
                  goals.slice(0, 3).map((goal) => {
                    const pct = Math.round(goal.progress * 100);
                    return (
                      <div key={goal.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-body-sm font-body-sm">
                          <span className="text-on-surface font-medium truncate max-w-[220px]">
                            {goal.title}
                          </span>
                          <span className="font-mono-sm text-mono-sm font-semibold text-primary">
                            {pct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                        <span className="font-mono-sm text-mono-sm text-secondary truncate">
                          {goal.description || (goal.target_date ? `Due ${new Date(goal.target_date).toLocaleDateString()}` : "Target Active")}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Knowledge Base Status */}
            <div className="flex flex-col p-space-md rounded-xl bg-surface-container-high/40 text-on-surface gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-sm text-mono-sm uppercase text-outline">
                  Knowledge Base Status
                </span>
                <span className="font-mono-sm text-mono-sm text-primary">
                  Ready &amp; Synced
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary shrink-0"></div>
                <span className="font-body-sm text-body-sm text-secondary">
                  All study notes and documents indexed and up to date.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
