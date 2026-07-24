"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BarChart3, CalendarClock, CheckCircle2, Clock3, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";

interface DailyCompletion { date: string; completed: number; }
interface ProductiveHour { hour: number; completed: number; activity_count: number; confidence: "low" | "medium" | "high"; }
interface Recommendation { title: string; detail: string; action_url: string; priority: "high" | "medium" | "low"; }
interface InsightEvidence { label: string; detail: string; action_url: string; }
interface BehavioralInsight { id: string; title: string; detail: string; priority: "high" | "medium" | "low"; evidence: InsightEvidence[]; }
interface AnalyticsTrend { label: string; direction: "improving" | "declining" | "stable" | "insufficient"; detail: string; }
interface WeeklyAnalytics { period_start: string; period_end: string; completed_this_week: number; completed_previous_week: number; completion_change: number | null; daily_completions: DailyCompletion[]; productive_hours: ProductiveHour[]; overdue_tasks: number; stale_tasks: number; tasks_without_deadlines: number; goals_without_deadlines: number; weekly_summary: string; recommendations: Recommendation[]; productive_hours_confidence: "low" | "medium" | "high"; behavioral_insights: BehavioralInsight[]; trends: AnalyticsTrend[]; data_coverage: string; }
interface KnowledgeProfile { total_explanations: number; learning_streak: number; average_score: number; strong_topics: string[]; weak_topics: string[]; misunderstood_concepts: string[]; topics_mastered: string[]; topics_needing_revision: string[]; knowledge_heatmap: { topic: string; score: number; attempts: number }[]; }

/**
 * The API client is generic, so validate the Phase 6 contract at this boundary.
 * This turns an outdated backend deployment into a useful load error instead
 * of allowing a missing array to crash the render tree.
 */
function parseWeeklyAnalytics(payload: unknown): WeeklyAnalytics {
  if (!payload || typeof payload !== "object") {
    throw new Error("Analytics API returned an invalid response.");
  }
  const record = payload as Record<string, unknown>;
  const requiredArrays = ["daily_completions", "productive_hours", "recommendations", "behavioral_insights", "trends"];
  const missing = requiredArrays.filter((field) => !Array.isArray(record[field]));
  if (missing.length) {
    throw new Error(`Analytics API response is missing Phase 6 fields: ${missing.join(", ")}. Restart or redeploy the backend.`);
  }
  const requiredScalars = ["weekly_summary", "productive_hours_confidence", "data_coverage"];
  if (requiredScalars.some((field) => typeof record[field] !== "string")) {
    throw new Error("Analytics API response does not match the current Phase 6 schema.");
  }
  return payload as WeeklyAnalytics;
}

function formatDay(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${value}T00:00:00`)); }
function formatHour(hour: number) { return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2024, 0, 1, hour)); }

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<WeeklyAnalytics | null>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<KnowledgeProfile | null>(null);

  useEffect(() => {
    void Promise.all([api.get<unknown>("/analytics/weekly"), api.get<KnowledgeProfile>("/learning/profile")])
      .then(([weekly, knowledge]) => { setProfile(knowledge); return parseWeeklyAnalytics(weekly); })
      .then(setAnalytics)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load productivity analytics."));
  }, []);

  const maxDaily = useMemo(() => Math.max(1, ...(analytics?.daily_completions.map((day) => day.completed) ?? [0])), [analytics]);
  const trend = analytics?.completion_change;
  const trendIsNegative = (trend ?? 0) < 0;
  const TrendIcon = trendIsNegative ? TrendingDown : TrendingUp;

  if (error) return <p role="alert" className="neo-state neo-state-error">{error}</p>;
  if (!analytics) return <div className="neo-state neo-state-loading" role="status">Loading productivity insights…</div>;

  const metrics = [
    { label: "Completed this week", value: analytics.completed_this_week, helper: analytics.completion_change === null ? "Building a baseline" : `${analytics.completion_change >= 0 ? "+" : ""}${analytics.completion_change}% vs last week`, icon: CheckCircle2 },
    { label: "Overdue tasks", value: analytics.overdue_tasks, helper: "Need a decision", icon: CalendarClock },
    { label: "Stale tasks", value: analytics.stale_tasks, helper: "No update in 7 days", icon: Clock3 },
    { label: "Goals without dates", value: analytics.goals_without_deadlines, helper: "Need a target", icon: Target },
  ];

  return <div className="flex flex-1 flex-col gap-6"><section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-label-md text-on-surface-variant">Analytics intelligence</p><h1 className="mt-1 flex items-center gap-3 text-display-lg text-on-surface"><BarChart3 /> Weekly progress, with context.</h1><p className="mt-3 max-w-3xl text-body-md text-on-surface-variant">{analytics.weekly_summary}</p></div><Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90">Open today plan</Link></div></section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => { const Icon = metric.icon; return <div key={metric.label} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-5"><div className="flex items-center justify-between"><p className="text-label-sm text-on-surface-variant">{metric.label}</p><Icon size={18} className="text-primary" /></div><p className="mt-3 text-display-lg-mobile text-on-surface">{metric.value}</p><p className="mt-1 text-body-sm text-on-surface-variant">{metric.helper}</p></div>; })}</section>
    <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]"><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><div className="flex items-center justify-between"><div><p className="text-label-sm text-on-surface-variant">Completion trend</p><h2 className="mt-1 text-headline-md text-on-surface">Tasks finished this week</h2></div><TrendIcon size={20} className={trendIsNegative ? "text-error" : "text-primary"} /></div><div className="mt-7 flex h-48 items-end gap-3">{analytics.daily_completions.map((day) => <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-xs text-on-surface-variant">{day.completed || ""}</span><div className="w-full rounded-t-lg bg-primary transition-all" style={{ height: `${Math.max(day.completed ? 10 : 2, (day.completed / maxDaily) * 100)}%` }} title={`${day.completed} tasks completed`} /><span className="text-xs text-on-surface-variant">{formatDay(day.date)}</span></div>)}</div><div className="mt-5 space-y-2">{analytics.trends.map((item) => <p key={item.label} className="text-body-sm text-on-surface-variant"><span className="font-medium text-on-surface">{item.label}:</span> {item.detail}</p>)}</div></div><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><p className="text-label-sm text-on-surface-variant">Productive hours</p><h2 className="mt-1 text-headline-md text-on-surface">Recorded work activity</h2><p className="mt-2 text-body-sm text-on-surface-variant">{analytics.productive_hours_confidence} confidence · UTC</p>{analytics.productive_hours.length ? <div className="mt-5 space-y-3">{analytics.productive_hours.map((entry) => <div key={entry.hour} className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3"><span className="text-body-md text-on-surface">{formatHour(entry.hour)}</span><span className="text-right text-body-sm text-on-surface-variant">{entry.activity_count} activity events<br />{entry.completed} completed</span></div>)}</div> : <p className="mt-5 text-body-md text-on-surface-variant">Add or update work, chat, documents, or memories to build a cautious activity-time estimate.</p>}</div></section>
    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><div className="flex items-center gap-2"><Activity size={18} className="text-primary" /><p className="text-label-sm text-on-surface-variant">Behavioral signals</p></div><h2 className="mt-1 text-headline-md text-on-surface">What the workspace supports</h2><div className="mt-5 space-y-3">{analytics.behavioral_insights.map((insight) => <div key={insight.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-4"><p className="text-body-md font-medium text-on-surface">{insight.title}</p><p className="mt-1 text-body-sm text-on-surface-variant">{insight.detail}</p>{insight.evidence.map((evidence) => <Link key={evidence.label} href={evidence.action_url} className="mt-3 block text-body-sm text-primary hover:underline">{evidence.label}: {evidence.detail}</Link>)}</div>)}</div><p className="mt-4 text-body-sm text-on-surface-variant">{analytics.data_coverage}</p></div><div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><p className="text-label-sm text-on-surface-variant">Attention needed</p><h2 className="mt-1 text-headline-md text-on-surface">Planning gaps</h2><div className="mt-5 space-y-3"><p className="rounded-xl bg-surface-container-low p-3 text-body-sm text-on-surface">{analytics.tasks_without_deadlines} open task{analytics.tasks_without_deadlines === 1 ? "" : "s"} without a deadline</p><p className="rounded-xl bg-surface-container-low p-3 text-body-sm text-on-surface">{analytics.goals_without_deadlines} active goal{analytics.goals_without_deadlines === 1 ? "" : "s"} without a target date</p></div><div className="mt-7 flex items-center gap-2"><Sparkles size={18} className="text-primary" /><p className="text-label-sm text-on-surface-variant">LoopBack recommendations</p></div><h2 className="mt-1 text-headline-md text-on-surface">Next best moves</h2><div className="mt-5 space-y-3">{analytics.recommendations.map((recommendation) => <Link key={recommendation.title} href={recommendation.action_url} className="block rounded-xl border border-outline-variant bg-surface-container-low p-4 hover:bg-surface-container"><p className="text-body-md font-medium text-on-surface">{recommendation.title}</p><p className="mt-1 text-body-sm text-on-surface-variant">{recommendation.detail}</p></Link>)}</div></div></section>
  </div>;
}
