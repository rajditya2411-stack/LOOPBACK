"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type Status = "todo" | "in_progress" | "review" | "done";
type Priority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
  due_date?: string | null;
  position: number;
}

type TaskFormValues = {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string;
};

const columns: { status: Status; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

const defaultFormValues: TaskFormValues = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: "",
};

const priorityStyles: Record<Priority, string> = {
  low: "neo-priority neo-priority-low bg-secondary-container text-on-secondary-container",
  medium: "neo-priority neo-priority-medium bg-surface-container-highest text-on-surface-variant",
  high: "neo-priority neo-priority-high bg-tertiary-container text-on-tertiary-container",
  urgent: "neo-priority neo-priority-urgent bg-error-container text-on-error-container",
};

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function isOverdue(task: Task) {
  if (!task.due_date || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.due_date).getTime() < today.getTime();
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formValues, setFormValues] = useState<TaskFormValues>(defaultFormValues);
  const [isSaving, setIsSaving] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadTasks = async () => {
    const data = await api.get<Task[]>("/tasks");
    setTasks(data);
  };

  useEffect(() => {
    void loadTasks()
      .catch(() => setError("Could not load tasks."))
      .finally(() => setIsLoading(false));
  }, []);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        columns.map(({ status }) => [
          status,
          tasks
            .filter((task) => task.status === status)
            .sort((a, b) => a.position - b.position),
        ]),
      ) as Record<Status, Task[]>,
    [tasks],
  );

  const openCreateForm = () => {
    setEditingTask(null);
    setFormValues(defaultFormValues);
    setError("");
    setIsFormOpen(true);
  };

  const openEditForm = (task: Task) => {
    setEditingTask(task);
    setFormValues({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      dueDate: dateInputValue(task.due_date),
    });
    setError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (!isSaving) setIsFormOpen(false);
  };

  const updateForm = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => {
    setFormValues((current) => ({ ...current, [key]: value }));
  };

  const saveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formValues.title.trim()) return;

    setIsSaving(true);
    setError("");
    const payload = {
      title: formValues.title.trim(),
      description: formValues.description.trim() || null,
      status: formValues.status,
      priority: formValues.priority,
      due_date: formValues.dueDate ? new Date(`${formValues.dueDate}T12:00:00`).toISOString() : null,
    };

    try {
      if (editingTask) {
        const updatedTask = await api.put<Task>(`/tasks/${editingTask.id}`, payload);
        setTasks((current) => current.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
      } else {
        const createdTask = await api.post<Task>("/tasks", payload);
        setTasks((current) => [...current, createdTask]);
      }
      setIsFormOpen(false);
    } catch {
      setError(editingTask ? "Could not save task changes." : "Could not create task.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    setError("");
    try {
      await api.delete(`/tasks/${taskToDelete.id}`);
      setTasks((current) => current.filter((task) => task.id !== taskToDelete.id));
      setTaskToDelete(null);
    } catch {
      setError("Could not delete task. It is still on your board.");
    } finally {
      setIsDeleting(false);
    }
  };

  const move = async (status: Status, position: number) => {
    if (!dragged) return;
    const task = tasks.find((item) => item.id === dragged);
    setDragged(null);
    if (!task || (task.status === status && task.position === position)) return;

    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status, position } : item)),
    );
    setError("");
    try {
      await api.post<Task>("/tasks/reorder", {
        task_id: task.id,
        new_status: status,
        new_position: position,
      });
      await loadTasks();
    } catch {
      setError("Could not move task.");
      void loadTasks().catch(() => setError("Could not move task or reload the board."));
    }
  };

  return (
    <div className="neo-tasks flex flex-1 flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
        <div>
          <p className="text-label-md text-on-surface-variant">Tasks</p>
          <h1 className="mt-1 flex items-center gap-3 text-display-lg text-on-surface">
            <CheckSquare /> Keep the day moving.
          </h1>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary transition-opacity hover:opacity-90"
        >
          <Plus size={16} /> New task
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-body-md text-on-surface-variant">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-[20px] border border-dashed border-outline-variant bg-surface-container-low px-6 text-center">
          <CheckSquare size={28} className="mb-3 text-primary" />
          <h2 className="text-title-md font-medium text-on-surface">No tasks yet</h2>
          <p className="mt-1 max-w-sm text-body-sm text-on-surface-variant">Create your first task and place it on the board.</p>
          <button type="button" onClick={openCreateForm} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary">
            <Plus size={16} /> Create task
          </button>
        </section>
      ) : (
        <section className="neo-kanban grid gap-6 md:grid-cols-2 xl:grid-cols-4" aria-label="Kanban board">
          {columns.map(({ status, label }) => (
            <div
              key={status}
              className="neo-kanban-column min-h-72 rounded-[20px] border border-outline-variant bg-surface-container-low p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void move(status, grouped[status].length)}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="font-medium text-on-surface">{label}</h2>
                <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs text-on-surface-variant">{grouped[status].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[status].map((task, index) => (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={() => setDragged(task.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.stopPropagation();
                      void move(status, index);
                    }}
                    className="neo-task-card cursor-grab rounded-xl border border-outline-variant bg-surface-container-lowest p-3 active:cursor-grabbing"
                  >
                    <div className="flex gap-2">
                      <GripVertical size={16} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="break-words text-sm font-medium text-on-surface">{task.title}</p>
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={() => openEditForm(task)} className="rounded-md p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface" aria-label={`Edit ${task.title}`} title="Edit task">
                              <Pencil size={15} />
                            </button>
                            <button type="button" onClick={() => setTaskToDelete(task)} className="rounded-md p-1 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container" aria-label={`Delete ${task.title}`} title="Delete task">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        {task.description && <p className="mt-1 break-words text-xs text-on-surface-variant">{task.description}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${priorityStyles[task.priority]}`}>{task.priority}</span>
                          {task.due_date && (
                            <span className={`inline-flex items-center gap-1 text-xs ${isOverdue(task) ? "font-medium text-error" : "text-on-surface-variant"}`}>
                              <CalendarDays size={13} /> {isOverdue(task) ? "Overdue: " : "Due: "}{formatDueDate(task.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={closeForm}>
          <section role="dialog" aria-modal="true" aria-labelledby="task-form-title" className="w-full max-w-lg rounded-lg border border-outline-variant bg-surface-container-lowest shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <h2 id="task-form-title" className="text-title-md font-medium text-on-surface">{editingTask ? "Edit task" : "New task"}</h2>
              <button type="button" onClick={closeForm} disabled={isSaving} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Close task form">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveTask} className="space-y-4 p-5">
              <label className="block text-body-sm font-medium text-on-surface">Title<input required maxLength={255} value={formValues.title} onChange={(event) => updateForm("title", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
              <label className="block text-body-sm font-medium text-on-surface">Description<textarea value={formValues.description} onChange={(event) => updateForm("description", event.target.value)} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface outline-none focus:border-primary" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-body-sm font-medium text-on-surface">Status<select value={formValues.status} onChange={(event) => updateForm("status", event.target.value as Status)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="review">Review</option><option value="done">Done</option></select></label>
                <label className="block text-body-sm font-medium text-on-surface">Priority<select value={formValues.priority} onChange={(event) => updateForm("priority", event.target.value as Priority)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
              </div>
              <label className="block text-body-sm font-medium text-on-surface">Due date<input type="date" value={formValues.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary" /></label>
              <div className="flex flex-wrap justify-end gap-2 pt-2"><button type="button" onClick={closeForm} disabled={isSaving} className="rounded-lg px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="submit" disabled={isSaving} className="rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary disabled:opacity-60">{isSaving ? "Saving task..." : editingTask ? "Save changes" : "Create task"}</button></div>
            </form>
          </section>
        </div>
      )}

      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => !isDeleting && setTaskToDelete(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-task-title" className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="delete-task-title" className="text-title-md font-medium text-on-surface">Delete task?</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">This permanently removes &quot;{taskToDelete.title}&quot;.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting} onClick={() => setTaskToDelete(null)} className="rounded-lg px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="button" disabled={isDeleting} onClick={() => void deleteTask()} className="rounded-lg bg-error px-4 py-2 text-body-sm font-medium text-on-error disabled:opacity-60">{isDeleting ? "Deleting task..." : "Delete task"}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
