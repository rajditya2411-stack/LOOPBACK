"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckSquare,
  FileText,
  Lightbulb,
  Plus,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";

type ActionName = "review_week" | "summarize_documents" | "create_tasks_from_documents" | "analyze_progress" | "forgotten_goals" | "suggest_next_actions";

interface TodayTask { id: string; title: string; priority: string; status: string; due_date: string | null; is_overdue: boolean; }
interface TodayGoal { id: string; title: string; progress: number; target_date: string | null; }
interface TodayMemory { id: string; content: string; category: string; is_pinned: boolean; }
interface Recommendation { title: string; detail: string; action_url: string; priority: "high" | "medium" | "low"; }
interface TodayWorkspace { focus_summary: string; important_tasks: TodayTask[]; goal_progress: TodayGoal[]; recent_memories: TodayMemory[]; recommendations: Recommendation[]; work_patterns: string[]; }
interface TaskSuggestion { title: string; description: string | null; priority: "low" | "medium" | "high" | "urgent"; }
interface ActionResult { action: ActionName; title: string; content: string; task_suggestions: TaskSuggestion[]; }

const actions: { action: ActionName; label: string; icon: typeof Sparkles }[] = [
  { action: "suggest_next_actions", label: "Suggest next actions", icon: Lightbulb },
  { action: "review_week", label: "Review my week", icon: CalendarDays },
  { action: "analyze_progress", label: "Analyze progress", icon: Target },
  { action: "summarize_documents", label: "Summarize documents", icon: FileText },
  { action: "create_tasks_from_documents", label: "Create tasks from documents", icon: Plus },
  { action: "forgotten_goals", label: "Find forgotten goals", icon: Brain },
];

const priorityStyle: Record<string, string> = {
  urgent: "bg-error-container text-on-error-container",
  high: "bg-error-container text-on-error-container",
  medium: "bg-secondary-container text-on-secondary-container",
  low: "bg-surface-container-highest text-on-surface-variant",
};

function formatDue(value: string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status >= 500) return "The workspace service is temporarily unavailable. Please try again.";
  return error.detail || fallback;
}

export default function DashboardPage() {
  const [today, setToday] = useState<TodayWorkspace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<ActionName | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [creatingTask, setCreatingTask] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    const data = await api.get<TodayWorkspace>("/productivity/today");
    setToday(data);
  }, []);

  useEffect(() => {
    void loadToday().catch((requestError: unknown) => setError(errorMessage(requestError, "Could not load today’s workspace plan."))).finally(() => setLoading(false));
  }, [loadToday]);

  const runAction = async (action: ActionName) => {
    setRunningAction(action);
    setError("");
    try {
      setActionResult(await api.post<ActionResult>("/productivity/actions", { action }));
    } catch (requestError) {
      setError(errorMessage(requestError, "This action could not run. Please try again."));
    } finally {
      setRunningAction(null);
    }
  };

  const createTask = async (suggestion: TaskSuggestion) => {
    setCreatingTask(suggestion.title);
    try {
      await api.post("/tasks", { title: suggestion.title, description: suggestion.description, priority: suggestion.priority });
      await loadToday();
    } catch (requestError) {
      setError(errorMessage(requestError, "Could not create that task."));
    } finally {
      setCreatingTask(null);
    }
  };

  const isNewWorkspace = !loading && Boolean(
    today
      && today.important_tasks.length === 0
      && today.goal_progress.length === 0
      && today.recent_memories.length === 0,
  );

  return (
    <div className="neo-dashboard flex flex-1 flex-col gap-6">
      <section className="premium-card rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl"><p className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 text-label-sm text-on-surface-variant"><Sparkles size={14} /> Today</p><h1 className="mt-4 text-display-lg-mobile text-on-surface lg:text-display-lg">What should you do today?</h1><p className="mt-2 text-body-md text-on-surface-variant">{loading ? "Building your focus plan…" : today?.focus_summary}</p></div>
          <div className="flex items-center gap-3"><div className="neo-date-widget rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-right"><p className="text-label-sm text-on-surface-variant">Today</p><p className="text-title-md text-on-surface">{new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p></div><Link href="/chat" className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-body-sm font-medium text-on-primary hover:opacity-90">Open chat <ArrowRight size={16} /></Link></div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {isNewWorkspace && <section className="rounded-[20px] border border-primary/30 bg-primary-container p-6 text-on-primary-container"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="inline-flex items-center gap-2 text-label-sm font-medium"><Sparkles size={15} /> Get started</p><h2 className="mt-2 text-headline-md">Give LoopBack something useful to remember.</h2><p className="mt-2 max-w-2xl text-body-md opacity-90">Create a task, define a goal, or upload a document. Your focus plan and recommendations will appear as you work.</p></div><div className="flex flex-wrap gap-3"><Link href="/tasks" className="rounded-lg bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90">Create a task</Link><Link href="/goals" className="rounded-lg border border-on-primary-container/30 px-4 py-2.5 text-body-sm font-medium hover:bg-on-primary-container/10">Add a goal</Link><Link href="/documents" className="rounded-lg border border-on-primary-container/30 px-4 py-2.5 text-body-sm font-medium hover:bg-on-primary-container/10">Upload a document</Link></div></div></section>}

      <section className="grid gap-8 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><div className="flex items-center justify-between"><div><p className="text-label-sm text-on-surface-variant">Important tasks</p><h2 className="mt-1 text-headline-md text-on-surface">Focus list</h2></div><CheckSquare size={20} className="text-primary" /></div><div className="mt-5 space-y-3">{loading ? <p className="text-body-md text-on-surface-variant">Loading focus items…</p> : today?.important_tasks.length ? today.important_tasks.map((task) => <Link key={task.id} href="/tasks" className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 transition-colors hover:bg-surface-container"><div className="min-w-0"><p className="truncate text-body-md font-medium text-on-surface">{task.title}</p><p className={`mt-1 text-body-sm ${task.is_overdue ? "text-error" : "text-on-surface-variant"}`}>{task.is_overdue ? "Overdue" : `Due ${formatDue(task.due_date)}`}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium capitalize ${priorityStyle[task.priority]}`}>{task.priority}</span></Link>) : <p className="rounded-xl bg-surface-container-low p-4 text-body-md text-on-surface-variant">No open tasks yet. Capture the next meaningful action.</p>}</div></div>
        <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><p className="text-label-sm text-on-surface-variant">Patterns</p><h2 className="mt-1 text-headline-md text-on-surface">Planning signals</h2><div className="mt-5 space-y-3">{loading ? <p className="text-body-md text-on-surface-variant">Reading patterns…</p> : today?.work_patterns.map((pattern) => <p key={pattern} className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-body-sm text-on-surface-variant">{pattern}</p>)}</div><Link href="/analytics" className="mt-5 inline-flex items-center gap-2 text-body-sm font-medium text-primary hover:underline">Open analytics <ArrowRight size={15} /></Link></div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2"><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><div className="flex items-center justify-between"><div><p className="text-label-sm text-on-surface-variant">Goals</p><h2 className="mt-1 text-headline-md text-on-surface">Progress at a glance</h2></div><Target size={20} className="text-primary" /></div><div className="mt-5 space-y-4">{today?.goal_progress.length ? today.goal_progress.map((goal) => <Link key={goal.id} href="/goals" className="block rounded-xl border border-outline-variant bg-surface-container-low p-4 hover:bg-surface-container"><div className="flex justify-between gap-3"><p className="truncate text-body-md font-medium text-on-surface">{goal.title}</p><span className="text-body-sm text-on-surface-variant">{Math.round(goal.progress * 100)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-highest"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(goal.progress * 100)}%` }} /></div></Link>) : <p className="text-body-md text-on-surface-variant">No active goals yet.</p>}</div></div><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><div className="flex items-center justify-between"><div><p className="text-label-sm text-on-surface-variant">Recommendations</p><h2 className="mt-1 text-headline-md text-on-surface">Make progress easier</h2></div><Lightbulb size={20} className="text-primary" /></div><div className="mt-5 space-y-3">{today?.recommendations.map((recommendation) => <Link key={recommendation.title} href={recommendation.action_url} className="block rounded-xl border border-outline-variant bg-surface-container-low p-4 hover:bg-surface-container"><p className="text-body-md font-medium text-on-surface">{recommendation.title}</p><p className="mt-1 text-body-sm text-on-surface-variant">{recommendation.detail}</p></Link>)}</div></div></section>

      <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-label-sm text-on-surface-variant">Recent memory</p><h2 className="mt-1 text-headline-md text-on-surface">Context worth carrying forward</h2></div><Link href="/memory" className="text-body-sm font-medium text-primary hover:underline">Open memory</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{today?.recent_memories.length ? today.recent_memories.map((memory) => <Link key={memory.id} href="/memory" className="rounded-xl border border-outline-variant bg-surface-container-low p-4 hover:bg-surface-container"><p className="text-xs font-medium capitalize text-primary">{memory.category}{memory.is_pinned ? " · pinned" : ""}</p><p className="mt-2 line-clamp-3 text-body-sm text-on-surface">{memory.content}</p></Link>) : <p className="text-body-md text-on-surface-variant">No saved memories yet. Helpful context from chat will appear here.</p>}</div></section>

      <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><p className="text-label-sm text-on-surface-variant">AI actions</p><h2 className="mt-1 text-headline-md text-on-surface">Ask LoopBack to do the prep work</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{actions.map(({ action, label, icon: Icon }) => <button key={action} type="button" onClick={() => void runAction(action)} disabled={runningAction !== null} className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-left text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"><span className="inline-flex items-center gap-3"><Icon size={17} className="text-primary" />{runningAction === action ? "Working…" : label}</span><ArrowRight size={15} className="text-on-surface-variant" /></button>)}</div></section>

      {actionResult && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => setActionResult(null)}><section role="dialog" aria-modal="true" aria-labelledby="action-result-title" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-label-sm text-on-surface-variant">AI action</p><h2 id="action-result-title" className="mt-1 text-headline-md text-on-surface">{actionResult.title}</h2></div><button type="button" onClick={() => setActionResult(null)} className="rounded-md p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label="Close"><X size={18} /></button></div><p className="mt-5 whitespace-pre-wrap text-body-md leading-relaxed text-on-surface">{actionResult.content}</p>{actionResult.task_suggestions.length > 0 && <div className="mt-6 border-t border-outline-variant pt-5"><h3 className="text-title-md text-on-surface">Suggested tasks</h3><div className="mt-3 space-y-3">{actionResult.task_suggestions.map((suggestion) => <div key={suggestion.title} className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-4"><div><p className="text-body-md font-medium text-on-surface">{suggestion.title}</p>{suggestion.description && <p className="mt-1 text-body-sm text-on-surface-variant">{suggestion.description}</p>}</div><button type="button" onClick={() => void createTask(suggestion)} disabled={creatingTask === suggestion.title} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-body-sm font-medium text-on-primary disabled:opacity-60">{creatingTask === suggestion.title ? "Adding…" : "Add task"}</button></div>)}</div></div>}</section></div>}
    </div>
  );
}
