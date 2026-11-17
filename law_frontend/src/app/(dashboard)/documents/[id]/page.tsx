"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, FileText, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

type DocumentStatus = "pending" | "processing" | "completed" | "failed";

interface PreviewChunk {
  id: string;
  content: string;
  chunk_index: number;
  page_number?: number | null;
}

interface DocumentDetail {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
  status: DocumentStatus;
  summary?: string | null;
  page_count?: number | null;
  word_count?: number | null;
  processing_error?: string | null;
  created_at: string;
  preview_chunks: PreviewChunk[];
}

interface StudyPrompt {
  session_id: string;
  topic: string;
  prompt: string;
}

interface Feedback {
  session_id: string;
  score: number;
  accuracy: number;
  quality: number;
  difficulty: string;
  missing_concepts: string[];
  misconceptions: string[];
  strengths: string[];
  feedback: string;
  follow_up_questions: string[];
  revision_recommendation: string;
}

const statusStyles: Record<DocumentStatus, string> = {
  pending: "bg-surface-container-highest text-on-surface-variant",
  processing: "bg-primary-container text-on-primary-container",
  completed: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30",
  failed: "bg-error/10 text-error border border-error/30",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [study, setStudy] = useState<StudyPrompt | null>(null);
  const [explanation, setExplanation] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isStudying, setIsStudying] = useState(false);
  const [history, setHistory] = useState<Feedback[]>([]);

  const loadDocument = useCallback(async () => {
    const [data, pastSessions] = await Promise.all([
      api.get<DocumentDetail>(`/documents/${params.id}`),
      api.get<Feedback[]>(`/learning/documents/${params.id}/sessions`).catch(() => []),
    ]);
    setDocument(data);
    setHistory(pastSessions);
  }, [params.id]);

  useEffect(() => {
    void loadDocument()
      .catch(() => setError("This pleading could not be found in chamber records."))
      .finally(() => setIsLoading(false));
  }, [loadDocument]);

  useEffect(() => {
    if (!document || !["pending", "processing"].includes(document.status)) return;
    const interval = window.setInterval(
      () => void loadDocument().catch(() => setError("Could not refresh pleading status.")),
      3000
    );
    return () => window.clearInterval(interval);
  }, [document, loadDocument]);

  const retry = async () => {
    if (!document) return;
    setIsRetrying(true);
    setError("");
    try {
      await api.post(`/documents/${document.id}/retry`);
      await loadDocument();
    } catch {
      setError("Could not restart pleading vectorization.");
    } finally {
      setIsRetrying(false);
    }
  };

  const remove = async () => {
    if (!document || !window.confirm(`Permanently delete "${document.title}" from vault?`)) return;
    setIsDeleting(true);
    setError("");
    try {
      await api.delete(`/documents/${document.id}`);
      router.replace("/documents");
    } catch {
      setError("Could not delete this pleading.");
      setIsDeleting(false);
    }
  };

  const startStudy = async () => {
    if (!document) return;
    setIsStudying(true);
    setError("");
    try {
      setStudy(await api.post<StudyPrompt>(`/learning/documents/${document.id}/study`));
      setFeedback(null);
      setExplanation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start cross-examination prep session.");
    } finally {
      setIsStudying(false);
    }
  };

  const submitExplanation = async () => {
    if (!study || explanation.trim().length < 20) return;
    setIsStudying(true);
    setError("");
    try {
      const fb = await api.post<Feedback>(`/learning/sessions/${study.session_id}/explanation`, {
        explanation,
      });
      setFeedback(fb);
      setHistory((prev) => [fb, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not evaluate legal submission.");
    } finally {
      setIsStudying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full px-space-lg sm:px-space-xl py-16 text-center text-body-md text-on-surface-variant font-sans">
        Loading pleading evidence &amp; vector chunks...
      </div>
    );
  }

  if (!document) {
    return (
      <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-4 font-sans">
        <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {error || "Pleading not found."}
        </p>
        <Link href="/documents" className="inline-flex items-center gap-2 text-body-sm font-medium text-primary">
          <ArrowLeft size={16} /> Back to Pleadings Library
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        <Link
          href="/documents"
          className="inline-flex items-center gap-2 text-body-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft size={16} /> Back to Pleadings Library
        </Link>

        {/* Pleading Details Banner */}
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-xs">
          <div className="min-w-0 space-y-1">
            <span className="text-[11px] font-mono-sm uppercase text-outline">
              Pleading Details &amp; Vectorization Particulars
            </span>
            <h1 className="flex items-center gap-3 text-headline-md text-on-surface font-semibold">
              <FileText className="shrink-0 text-primary" /> {document.title}
            </h1>
            <p className="text-body-sm text-on-surface-variant">
              {document.file_type.toUpperCase()} · {formatFileSize(document.file_size)} · Uploaded {formatDate(document.created_at)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase ${statusStyles[document.status]}`}>
              {document.status}
            </span>
            {document.status === "failed" && (
              <button
                type="button"
                onClick={retry}
                disabled={isRetrying}
                className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-container flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={14} /> Retry
              </button>
            )}
            <button
              type="button"
              onClick={remove}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-lg border border-error/30 text-xs font-medium text-error hover:bg-error/10 flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </header>

        {error && (
          <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-xs text-error">
            {error}
          </div>
        )}

        {/* Interactive Precedent & Cross-Examination Prep Mode */}
        <section className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Precedent Verification &amp; Cross-Examination Prep
              </h2>
              <p className="text-xs text-on-surface-variant">
                AI tests counsel on procedural grounds, contradiction identification, and binding precedents without revealing the raw pleading text.
              </p>
            </div>
            {!study && (
              <button
                type="button"
                onClick={startStudy}
                disabled={isStudying}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">school</span>
                <span>{isStudying ? "Generating Prep Inquiry..." : "Start Prep Session"}</span>
              </button>
            )}
          </div>

          {study && (
            <div className="space-y-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30">
              <div className="space-y-1">
                <span className="text-[10px] font-mono-sm uppercase text-primary font-semibold">
                  Examination Topic: {study.topic}
                </span>
                <p className="text-sm font-medium text-on-surface leading-relaxed">
                  {study.prompt}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-on-surface">
                  Your Legal Submissions &amp; Argument Outline:
                </label>
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Draft your legal response or cross-examination questions here (minimum 20 characters)..."
                  rows={4}
                  className="w-full p-3 text-xs rounded-lg border border-outline-variant/40 bg-surface-container-lowest focus:border-primary focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-outline">
                  {explanation.trim().length} characters
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStudy(null)}
                    className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitExplanation}
                    disabled={isStudying || explanation.trim().length < 20}
                    className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isStudying ? "Evaluating Arguments..." : "Submit to Senior Counsel"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {feedback && (
            <div className="p-4 rounded-xl bg-surface-container-lowest border border-primary/30 space-y-3">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
                <span className="font-semibold text-xs text-on-surface">
                  Advocacy Assessment &amp; Evaluation
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary">Score: {feedback.score}/100</span>
                  <span className="text-xs text-emerald-600">Accuracy: {feedback.accuracy}%</span>
                </div>
              </div>

              <p className="text-xs text-on-surface leading-relaxed">{feedback.feedback}</p>

              {feedback.strengths.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-emerald-700">Argument Strengths:</span>
                  <ul className="list-disc list-inside text-xs text-on-surface-variant space-y-0.5">
                    {feedback.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.missing_concepts.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-amber-700">Missing Legal Grounds &amp; Citations:</span>
                  <ul className="list-disc list-inside text-xs text-on-surface-variant space-y-0.5">
                    {feedback.missing_concepts.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={startStudy}
                  className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest text-primary text-xs font-medium cursor-pointer"
                >
                  Next Examination Question →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Vectorized Chunks Preview */}
        <section className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-space-sm">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Extracted Pleading Chunks &amp; Citations ({document.preview_chunks?.length || 0})
              </h2>
              <p className="text-xs text-on-surface-variant">
                Partitioned text units indexed for RAG retrieval during AI inquiry sessions.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {(!document.preview_chunks || document.preview_chunks.length === 0) ? (
              <p className="text-xs text-on-surface-variant py-6 text-center">
                No vector chunks available. Pleading may still be processing.
              </p>
            ) : (
              document.preview_chunks.map((chunk) => (
                <div
                  key={chunk.id}
                  className="p-3.5 rounded-lg border border-outline-variant/30 bg-surface-container-low space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] text-outline font-mono-sm">
                    <span>Chunk #{chunk.chunk_index}</span>
                    {chunk.page_number && <span>Page {chunk.page_number}</span>}
                  </div>
                  <p className="text-xs text-on-surface leading-relaxed font-mono-sm whitespace-pre-wrap">
                    {chunk.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
