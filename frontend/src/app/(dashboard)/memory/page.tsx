"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Brain,
  CalendarDays,
  Check,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type MemoryCategory = "general" | "preference" | "decision" | "fact" | "goal" | "project" | "instruction" | "important_fact" | "long_term_goal" | "project_information";

interface Memory {
  id: string;
  content: string;
  category: MemoryCategory;
  source: string;
  review_status: "pending" | "approved" | "rejected";
  is_pinned: boolean;
  confidence: number | null;
  created_at: string;
  updated_at: string;
}

type MemoryFormValues = {
  content: string;
  category: MemoryCategory;
  isPinned: boolean;
};

const defaultFormValues: MemoryFormValues = {
  content: "",
  category: "general",
  isPinned: false,
};

const categoryStyles: Record<MemoryCategory, string> = {
  general: "bg-surface-container-highest text-on-surface-variant",
  preference: "bg-secondary-container text-on-secondary-container",
  fact: "bg-primary-container text-on-primary-container",
  decision: "bg-secondary-container text-on-secondary-container",
  goal: "bg-tertiary-container text-on-tertiary-container",
  project: "bg-primary-container text-on-primary-container",
  instruction: "bg-tertiary-container text-on-tertiary-container",
  important_fact: "bg-primary-container text-on-primary-container",
  long_term_goal: "bg-tertiary-container text-on-tertiary-container",
  project_information: "bg-secondary-container text-on-secondary-container",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [pendingMemories, setPendingMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [formValues, setFormValues] = useState<MemoryFormValues>(defaultFormValues);
  const [isSaving, setIsSaving] = useState(false);
  const [memoryToDelete, setMemoryToDelete] = useState<Memory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingMemoryId, setTogglingMemoryId] = useState<string | null>(null);
  const [reviewingMemoryId, setReviewingMemoryId] = useState<string | null>(null);
  const [expandedMemoryIds, setExpandedMemoryIds] = useState<Set<string>>(() => new Set());

  const loadMemories = async () => {
    const [data, pending] = await Promise.all([
      api.get<Memory[]>("/memory"),
      api.get<Memory[]>("/memory/review"),
    ]);
    setMemories(data);
    setPendingMemories(pending);
  };

  useEffect(() => {
    void loadMemories()
      .catch(() => setError("Could not load memories."))
      .finally(() => setIsLoading(false));
  }, []);

  const sortedMemories = useMemo(
    () => memories.filter((memory) => memory.review_status !== "pending").sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [memories],
  );

  const metrics = useMemo(() => ({
    pinned: memories.filter((memory) => memory.is_pinned).length,
    facts: memories.filter((memory) => memory.category === "fact").length,
    instructions: memories.filter((memory) => memory.category === "instruction").length,
    extracted: memories.filter((memory) => memory.source === "auto").length,
  }), [memories]);

  const openCreateForm = () => {
    setEditingMemory(null);
    setFormValues(defaultFormValues);
    setError("");
    setIsFormOpen(true);
  };

  const openEditForm = (memory: Memory) => {
    setEditingMemory(memory);
    setFormValues({ content: memory.content, category: memory.category, isPinned: memory.is_pinned });
    setError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (!isSaving) setIsFormOpen(false);
  };

  const updateForm = <K extends keyof MemoryFormValues>(key: K, value: MemoryFormValues[K]) => {
    setFormValues((current) => ({ ...current, [key]: value }));
  };

  const saveMemory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formValues.content.trim()) return;

    setIsSaving(true);
    setError("");
    const payload = {
      content: formValues.content.trim(),
      category: formValues.category,
      is_pinned: formValues.isPinned,
    };

    try {
      if (editingMemory) {
        const updatedMemory = await api.put<Memory>(`/memory/${editingMemory.id}`, payload);
        setMemories((current) => current.map((memory) => (memory.id === updatedMemory.id ? updatedMemory : memory)));
        setPendingMemories((current) => current.map((memory) => (memory.id === updatedMemory.id ? updatedMemory : memory)));
      } else {
        const createdMemory = await api.post<Memory>("/memory", payload);
        setMemories((current) => [createdMemory, ...current]);
      }
      setIsFormOpen(false);
    } catch {
      setError(editingMemory ? "Could not save memory changes." : "Could not create memory.");
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (memory: Memory) => {
    setTogglingMemoryId(memory.id);
    setError("");
    try {
      const updatedMemory = await api.put<Memory>(`/memory/${memory.id}`, { is_pinned: !memory.is_pinned });
      setMemories((current) => current.map((item) => (item.id === updatedMemory.id ? updatedMemory : item)));
    } catch {
      setError(memory.is_pinned ? "Could not unpin memory." : "Could not pin memory.");
    } finally {
      setTogglingMemoryId(null);
    }
  };

  const reviewMemory = async (memory: Memory, action: "approve" | "reject") => {
    setReviewingMemoryId(memory.id);
    setError("");
    try {
      const updated = await api.post<Memory>(`/memory/${memory.id}/${action}`);
      setMemories((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setPendingMemories((current) => current.filter((item) => item.id !== updated.id));
    } catch {
      setError(`Could not ${action} this memory.`);
    } finally {
      setReviewingMemoryId(null);
    }
  };

  const deleteMemory = async () => {
    if (!memoryToDelete) return;
    setIsDeleting(true);
    setError("");
    try {
      await api.delete(`/memory/${memoryToDelete.id}`);
      setMemories((current) => current.filter((memory) => memory.id !== memoryToDelete.id));
      setMemoryToDelete(null);
    } catch {
      setError("Could not delete memory. It is still visible.");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleExpanded = (memoryId: string) => {
    setExpandedMemoryIds((current) => {
      const next = new Set(current);
      if (next.has(memoryId)) next.delete(memoryId);
      else next.add(memoryId);
      return next;
    });
  };

  return (
    <div className="neo-memory flex flex-1 flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
        <div>
          <p className="text-label-md text-on-surface-variant">Memory</p>
          <h1 className="mt-1 flex items-center gap-3 text-display-lg text-on-surface"><Brain /> Store the context worth keeping.</h1>
        </div>
        <button type="button" onClick={openCreateForm} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary transition-opacity hover:opacity-90"><Plus size={16} /> New memory</button>
      </header>

      <section className="neo-memory-metrics grid gap-5 sm:grid-cols-5" aria-label="Memory summary">
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Pinned</p><p className="mt-1 text-title-lg font-medium text-on-surface">{metrics.pinned}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Total memories</p><p className="mt-1 text-title-lg font-medium text-on-surface">{memories.length}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Facts</p><p className="mt-1 text-title-lg font-medium text-on-surface">{metrics.facts}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Instructions</p><p className="mt-1 text-title-lg font-medium text-on-surface">{metrics.instructions}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">AI extracted</p><p className="mt-1 text-title-lg font-medium text-on-surface">{metrics.extracted}</p></div>
      </section>

      {pendingMemories.length > 0 && (
        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5" aria-label="Memories to review">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-label-md text-on-surface-variant">Memory review</p><h2 className="text-title-md font-medium text-on-surface">Review AI-suggested memories</h2></div><span className="rounded-full bg-primary-container px-2 py-1 text-xs font-medium text-on-primary-container">{pendingMemories.length} pending</span></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {pendingMemories.map((memory) => (
              <article key={memory.id} className="rounded-lg border border-outline-variant bg-surface p-4">
                <div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${categoryStyles[memory.category]}`}>{memory.category.replaceAll("_", " ")}</span>{memory.confidence !== null && <span className="text-xs text-on-surface-variant">AI confidence {Math.round(memory.confidence * 100)}%</span>}</div>
                <p className="mt-3 whitespace-pre-wrap break-words text-body-md text-on-surface">{memory.content}</p>
                <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => openEditForm(memory)} disabled={reviewingMemoryId === memory.id} className="rounded-lg px-3 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Edit</button><button type="button" onClick={() => void reviewMemory(memory, "reject")} disabled={reviewingMemoryId === memory.id} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-body-sm font-medium text-error hover:bg-error-container"><X size={15} /> Reject</button><button type="button" onClick={() => void reviewMemory(memory, "approve")} disabled={reviewingMemoryId === memory.id} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-body-sm font-medium text-on-primary disabled:opacity-60"><Check size={15} /> {reviewingMemoryId === memory.id ? "Saving..." : "Approve"}</button></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      {isLoading ? (
        <div className="py-16 text-center text-body-md text-on-surface-variant">Loading memories...</div>
      ) : memories.length === 0 ? (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-[20px] border border-dashed border-outline-variant bg-surface-container-low px-6 text-center">
          <Brain size={28} className="mb-3 text-primary" />
          <h2 className="text-title-md font-medium text-on-surface">No memories yet</h2>
          <p className="mt-1 max-w-sm text-body-sm text-on-surface-variant">Start building your personal knowledge base with details worth keeping.</p>
          <button type="button" onClick={openCreateForm} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary"><Plus size={16} /> Create memory</button>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Memories">
          {sortedMemories.map((memory) => {
            const isExpanded = expandedMemoryIds.has(memory.id);
            return (
              <article key={memory.id} className="flex min-w-0 flex-col rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {memory.is_pinned && <Pin size={16} className="shrink-0 text-primary" aria-label="Pinned" />}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${categoryStyles[memory.category]}`}>{memory.category}</span>
                    {memory.source === "auto" && <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant"><Sparkles size={13} aria-hidden="true" /> AI</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" disabled={togglingMemoryId === memory.id} onClick={() => void togglePin(memory)} className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-60" aria-label={`${memory.is_pinned ? "Unpin" : "Pin"} memory`} title={memory.is_pinned ? "Unpin memory" : "Pin memory"}>{memory.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>
                    <button type="button" onClick={() => openEditForm(memory)} className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface" aria-label="Edit memory" title="Edit memory"><Pencil size={16} /></button>
                    <button type="button" onClick={() => setMemoryToDelete(memory)} className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container" aria-label="Delete memory" title="Delete memory"><Trash2 size={16} /></button>
                  </div>
                </div>
                <p className={`mt-4 whitespace-pre-wrap break-words text-body-md text-on-surface ${isExpanded ? "" : "line-clamp-4"}`}>{memory.content}</p>
                {memory.content.length > 220 && <button type="button" onClick={() => toggleExpanded(memory.id)} className="mt-2 w-fit text-body-sm font-medium text-primary hover:underline">{isExpanded ? "Show less" : "Show more"}</button>}
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-on-surface-variant"><span className="inline-flex items-center gap-1"><CalendarDays size={14} /> Added {formatDate(memory.created_at)}</span>{memory.source === "auto" && memory.confidence !== null && <span>AI confidence {Math.round(memory.confidence * 100)}%</span>}</div>
              </article>
            );
          })}
        </section>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={closeForm}>
          <section role="dialog" aria-modal="true" aria-labelledby="memory-form-title" className="w-full max-w-lg rounded-lg border border-outline-variant bg-surface-container-lowest shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4"><h2 id="memory-form-title" className="text-title-md font-medium text-on-surface">{editingMemory ? "Edit memory" : "New memory"}</h2><button type="button" onClick={closeForm} disabled={isSaving} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Close memory form"><X size={18} /></button></div>
            <form onSubmit={saveMemory} className="space-y-4 p-5">
              <label className="block text-body-sm font-medium text-on-surface">Memory content<textarea required value={formValues.content} onChange={(event) => updateForm("content", event.target.value)} rows={6} className="mt-1.5 w-full resize-y rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface outline-none focus:border-primary" /></label>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <label className="block flex-1 text-body-sm font-medium text-on-surface">Category<select value={formValues.category} onChange={(event) => updateForm("category", event.target.value as MemoryCategory)} className="mt-1.5 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-on-surface outline-none focus:border-primary"><option value="general">General</option><option value="preference">Preference</option><option value="decision">Decision</option><option value="fact">Fact</option><option value="important_fact">Important fact</option><option value="goal">Goal</option><option value="long_term_goal">Long-term goal</option><option value="project">Project</option><option value="project_information">Project information</option><option value="instruction">Instruction</option></select></label>
                <label className="inline-flex h-11 items-center gap-2 text-body-sm font-medium text-on-surface"><input type="checkbox" checked={formValues.isPinned} onChange={(event) => updateForm("isPinned", event.target.checked)} className="h-4 w-4 accent-primary" /> Pin memory</label>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2"><button type="button" onClick={closeForm} disabled={isSaving} className="rounded-lg px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="submit" disabled={isSaving} className="rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary disabled:opacity-60">{isSaving ? "Saving memory..." : editingMemory ? "Save changes" : "Create memory"}</button></div>
            </form>
          </section>
        </div>
      )}

      {memoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => !isDeleting && setMemoryToDelete(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-memory-title" className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="delete-memory-title" className="text-title-md font-medium text-on-surface">Delete memory?</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">This permanently removes this saved memory.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting} onClick={() => setMemoryToDelete(null)} className="rounded-lg px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="button" disabled={isDeleting} onClick={() => void deleteMemory()} className="rounded-lg bg-error px-4 py-2 text-body-sm font-medium text-on-error disabled:opacity-60">{isDeleting ? "Deleting memory..." : "Delete memory"}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
