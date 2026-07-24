"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CirclePause,
  Pencil,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type GoalStatus = "active" | "completed" | "paused" | "abandoned";
type GoalCategory = "daily" | "weekly" | "monthly" | "long_term";

interface Goal {
  id: string;
  title: string;
  description?: string | null;
  category: GoalCategory;
  status: GoalStatus;
  progress: number;
  target_value?: number | null;
  current_value?: number | null;
  unit?: string | null;
  target_date?: string | null;
}

type GoalFormValues = {
  title: string;
  description: string;
  category: GoalCategory;
  status: GoalStatus;
  progress: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  targetDate: string;
};

const defaultFormValues: GoalFormValues = {
  title: "",
  description: "",
  category: "monthly",
  status: "active",
  progress: "0",
  targetValue: "",
  currentValue: "",
  unit: "",
  targetDate: "",
};

const statusStyles: Record<GoalStatus, string> = {
  active: "neo-status neo-status-active bg-primary-container text-on-primary-container",
  completed: "neo-status neo-status-completed bg-secondary-container text-on-secondary-container",
  paused: "neo-status neo-status-paused bg-surface-container-highest text-on-surface-variant",
  abandoned: "neo-status neo-status-failed bg-error-container text-on-error-container",
};

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function numericValue(value: string) {
  return value === "" ? null : Number(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isOverdue(goal: Goal) {
  if (!goal.target_date || goal.status === "completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(goal.target_date).getTime() < today.getTime();
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formValues, setFormValues] = useState<GoalFormValues>(defaultFormValues);
  const [isSaving, setIsSaving] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completingGoalId, setCompletingGoalId] = useState<string | null>(null);

  const loadGoals = async () => {
    const data = await api.get<Goal[]>("/goals");
    setGoals(data);
  };

  useEffect(() => {
    void loadGoals()
      .catch(() => setError("Could not load goals."))
      .finally(() => setIsLoading(false));
  }, []);

  const metrics = useMemo(() => {
    const active = goals.filter((goal) => goal.status === "active").length;
    const completed = goals.filter((goal) => goal.status === "completed").length;
    const average = goals.length
      ? Math.round((goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length) * 100)
      : 0;
    return { active, completed, average };
  }, [goals]);

  const openCreateForm = () => {
    setEditingGoal(null);
    setFormValues(defaultFormValues);
    setError("");
    setIsFormOpen(true);
  };

  const openEditForm = (goal: Goal) => {
    setEditingGoal(goal);
    setFormValues({
      title: goal.title,
      description: goal.description ?? "",
      category: goal.category,
      status: goal.status,
      progress: String(Math.round(goal.progress * 100)),
      targetValue: goal.target_value === null || goal.target_value === undefined ? "" : String(goal.target_value),
      currentValue: goal.current_value === null || goal.current_value === undefined ? "" : String(goal.current_value),
      unit: goal.unit ?? "",
      targetDate: dateInputValue(goal.target_date),
    });
    setError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (!isSaving) setIsFormOpen(false);
  };

  const updateForm = <K extends keyof GoalFormValues>(key: K, value: GoalFormValues[K]) => {
    setFormValues((current) => ({ ...current, [key]: value }));
  };

  const saveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formValues.title.trim()) return;

    const enteredProgress = Math.min(100, Math.max(0, Number(formValues.progress || 0)));
    const progress = formValues.status === "completed" ? 1 : enteredProgress / 100;
    const payload = {
      title: formValues.title.trim(),
      description: formValues.description.trim() || null,
      category: formValues.category,
      status: formValues.status,
      progress,
      target_value: numericValue(formValues.targetValue),
      current_value: numericValue(formValues.currentValue),
      unit: formValues.unit.trim() || null,
      target_date: formValues.targetDate ? new Date(`${formValues.targetDate}T12:00:00`).toISOString() : null,
    };

    setIsSaving(true);
    setError("");
    try {
      if (editingGoal) {
        const updatedGoal = await api.put<Goal>(`/goals/${editingGoal.id}`, payload);
        setGoals((current) => current.map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal)));
      } else {
        const createdGoal = await api.post<Goal>("/goals", payload);
        setGoals((current) => [createdGoal, ...current]);
      }
      setIsFormOpen(false);
    } catch {
      setError(editingGoal ? "Could not save goal changes." : "Could not create goal.");
    } finally {
      setIsSaving(false);
    }
  };

  const completeGoal = async (goal: Goal) => {
    setCompletingGoalId(goal.id);
    setError("");
    try {
      const updatedGoal = await api.put<Goal>(`/goals/${goal.id}`, { status: "completed", progress: 1 });
      setGoals((current) => current.map((item) => (item.id === updatedGoal.id ? updatedGoal : item)));
    } catch {
      setError("Could not mark goal as completed.");
    } finally {
      setCompletingGoalId(null);
    }
  };

  const deleteGoal = async () => {
    if (!goalToDelete) return;
    setIsDeleting(true);
    setError("");
    try {
      await api.delete(`/goals/${goalToDelete.id}`);
      setGoals((current) => current.filter((goal) => goal.id !== goalToDelete.id));
      setGoalToDelete(null);
    } catch {
      setError("Could not delete goal. It is still visible.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="neo-goals flex flex-1 flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
        <div>
          <p className="text-label-md text-on-surface-variant">Goals</p>
          <h1 className="mt-1 flex items-center gap-3 text-display-lg text-on-surface"><Target /> Keep progress visible.</h1>
        </div>
        <button type="button" onClick={openCreateForm} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary transition-opacity hover:opacity-90"><Plus size={16} /> New goal</button>
      </header>

      <section className="neo-goal-metrics grid gap-6 sm:grid-cols-3" aria-label="Goal summary">
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Active goals</p><p className="mt-1 text-title-lg font-medium text-on-surface">{metrics.active}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Completed goals</p><p className="mt-1 text-title-lg font-medium text-on-surface">{metrics.completed}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Average progress</p><p className="mt-1 text-title-lg font-medium text-on-surface">{metrics.average}%</p></div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {isLoading ? (
        <div className="py-16 text-center text-body-md text-on-surface-variant">Loading goals...</div>
      ) : goals.length === 0 ? (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-[20px] border border-dashed border-outline-variant bg-surface-container-low px-6 text-center">
          <Target size={28} className="mb-3 text-primary" />
          <h2 className="text-title-md font-medium text-on-surface">No goals yet</h2>
          <p className="mt-1 max-w-sm text-body-sm text-on-surface-variant">Create your first goal and keep the outcome in view.</p>
          <button type="button" onClick={openCreateForm} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary"><Plus size={16} /> Create goal</button>
        </section>
      ) : (
        <section className="neo-goal-grid grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-label="Goals">
          {goals.map((goal) => {
            const progress = Math.round(goal.progress * 100);
            const overdue = isOverdue(goal);
            return (
              <article key={goal.id} className="neo-goal-card flex min-w-0 flex-col rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-title-sm font-medium text-on-surface">{goal.title}</p>
                    {goal.description && <p className="mt-1 break-words text-body-sm text-on-surface-variant">{goal.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => openEditForm(goal)} className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface" aria-label={`Edit ${goal.title}`} title="Edit goal"><Pencil size={16} /></button>
                    <button type="button" onClick={() => setGoalToDelete(goal)} className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container" aria-label={`Delete ${goal.title}`} title="Delete goal"><Trash2 size={16} /></button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[goal.status]}`}>{goal.status}</span><span className="text-body-sm font-medium text-on-surface">{progress}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-highest" aria-label={`${goal.title} is ${progress}% complete`}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>

                <div className="mt-4 space-y-2 text-body-sm text-on-surface-variant">
                  <p className="capitalize">{goal.category.replace("_", " ")}</p>
                  {goal.target_value !== null && goal.target_value !== undefined && <p>{goal.current_value ?? 0} / {goal.target_value}{goal.unit ? ` ${goal.unit}` : ""}</p>}
                  {goal.target_date && <p className={`inline-flex items-center gap-1 ${overdue ? "font-medium text-error" : ""}`}><CalendarDays size={14} /> {overdue ? "Overdue: " : "Target: "}{formatDate(goal.target_date)}</p>}
                </div>

                {goal.status !== "completed" && <button type="button" disabled={completingGoalId === goal.id} onClick={() => void completeGoal(goal)} className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-3 py-2 text-body-sm font-medium text-primary transition-colors hover:bg-primary-container disabled:opacity-60"><CheckCircle2 size={16} />{completingGoalId === goal.id ? "Completing goal..." : "Mark complete"}</button>}
                {goal.status === "paused" && <span className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-body-sm text-on-surface-variant"><CirclePause size={16} /> Paused</span>}
              </article>
            );
          })}
        </section>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={closeForm}>
          <section role="dialog" aria-modal="true" aria-labelledby="goal-form-title" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4"><h2 id="goal-form-title" className="text-title-md font-medium text-on-surface">{editingGoal ? "Edit goal" : "New goal"}</h2><button type="button" onClick={closeForm} disabled={isSaving} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Close goal form"><X size={18} /></button></div>
            <form onSubmit={saveGoal} className="space-y-4 p-5">
              <label className="block text-body-sm font-medium text-on-surface">Title<input required maxLength={255} value={formValues.title} onChange={(event) => updateForm("title", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
              <label className="block text-body-sm font-medium text-on-surface">Description<textarea value={formValues.description} onChange={(event) => updateForm("description", event.target.value)} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface outline-none focus:border-primary" /></label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-body-sm font-medium text-on-surface">Category<select value={formValues.category} onChange={(event) => updateForm("category", event.target.value as GoalCategory)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="long_term">Long term</option></select></label>
                <label className="block text-body-sm font-medium text-on-surface">Status<select value={formValues.status} onChange={(event) => updateForm("status", event.target.value as GoalStatus)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary"><option value="active">Active</option><option value="completed">Completed</option><option value="paused">Paused</option><option value="abandoned">Abandoned</option></select></label>
                <label className="block text-body-sm font-medium text-on-surface">Progress (%)<input type="number" min="0" max="100" value={formValues.progress} onChange={(event) => updateForm("progress", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-body-sm font-medium text-on-surface">Current value<input type="number" min="0" value={formValues.currentValue} onChange={(event) => updateForm("currentValue", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
                <label className="block text-body-sm font-medium text-on-surface">Target value<input type="number" min="0" value={formValues.targetValue} onChange={(event) => updateForm("targetValue", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
                <label className="block text-body-sm font-medium text-on-surface">Unit<input maxLength={50} value={formValues.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder="e.g. chapters" className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
              </div>
              <label className="block text-body-sm font-medium text-on-surface">Target date<input type="date" value={formValues.targetDate} onChange={(event) => updateForm("targetDate", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
              <div className="flex flex-wrap justify-end gap-2 pt-2"><button type="button" onClick={closeForm} disabled={isSaving} className="rounded-lg px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="submit" disabled={isSaving} className="rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary disabled:opacity-60">{isSaving ? "Saving goal..." : editingGoal ? "Save changes" : "Create goal"}</button></div>
            </form>
          </section>
        </div>
      )}

      {goalToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => !isDeleting && setGoalToDelete(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-goal-title" className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="delete-goal-title" className="text-title-md font-medium text-on-surface">Delete goal?</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">This permanently removes &quot;{goalToDelete.title}&quot;.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting} onClick={() => setGoalToDelete(null)} className="rounded-lg px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="button" disabled={isDeleting} onClick={() => void deleteGoal()} className="rounded-lg bg-error px-4 py-2 text-body-sm font-medium text-on-error disabled:opacity-60">{isDeleting ? "Deleting goal..." : "Delete goal"}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
