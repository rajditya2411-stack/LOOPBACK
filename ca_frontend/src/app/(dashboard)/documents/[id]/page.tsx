"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, FileText, RotateCcw, Trash2 } from "lucide-react";
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
interface StudyPrompt { session_id: string; topic: string; prompt: string; }
interface Feedback { session_id: string; score: number; accuracy: number; quality: number; difficulty: string; missing_concepts: string[]; misconceptions: string[]; strengths: string[]; feedback: string; follow_up_questions: string[]; revision_recommendation: string; }

const statusStyles: Record<DocumentStatus, string> = {
  pending: "neo-status neo-status-pending bg-surface-container-highest text-on-surface-variant",
  processing: "neo-status neo-status-processing bg-primary-container text-on-primary-container",
  completed: "neo-status neo-status-completed bg-secondary-container text-on-secondary-container",
  failed: "neo-status neo-status-failed bg-error-container text-on-error-container",
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
    void loadDocument().catch(() => setError("This document could not be found.")).finally(() => setIsLoading(false));
  }, [loadDocument]);

  useEffect(() => {
    if (!document || !["pending", "processing"].includes(document.status)) return;
    const interval = window.setInterval(() => void loadDocument().catch(() => setError("Could not refresh document status.")), 3000);
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
      setError("Could not restart document processing.");
    } finally {
      setIsRetrying(false);
    }
  };

  const remove = async () => {
    if (!document || !window.confirm(`Delete \"${document.title}\" permanently?`)) return;
    setIsDeleting(true);
    setError("");
    try {
      await api.delete(`/documents/${document.id}`);
      router.replace("/documents");
    } catch {
      setError("Could not delete this document.");
      setIsDeleting(false);
    }
  };

  const startStudy = async () => {
    if (!document) return;
    setIsStudying(true); setError("");
    try { setStudy(await api.post<StudyPrompt>(`/learning/documents/${document.id}/study`)); setFeedback(null); setExplanation(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not start audit review session."); }
    finally { setIsStudying(false); }
  };

  const submitExplanation = async () => {
    if (!study || explanation.trim().length < 20) return;
    setIsStudying(true); setError("");
    try {
      const fb = await api.post<Feedback>(`/learning/sessions/${study.session_id}/explanation`, { explanation });
      setFeedback(fb);
      setHistory((prev) => [fb, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not evaluate explanation.");
    } finally {
      setIsStudying(false);
    }
  };

  if (isLoading) return <div className="w-full px-space-lg py-16 text-center text-body-md text-on-surface-variant">Loading working paper evidence...</div>;
  if (!document) return <div className="w-full px-space-lg py-space-lg space-y-4"><p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">{error || "Working paper not found."}</p><Link href="/documents" className="inline-flex items-center gap-2 text-body-sm font-medium text-primary"><ArrowLeft size={16} /> Back to Working Papers</Link></div>;

  return (
    <div className="w-full px-space-lg py-space-lg neo-document-detail flex flex-1 flex-col gap-8">
      <Link href="/documents" className="inline-flex w-fit items-center gap-2 text-body-sm font-medium text-primary hover:underline"><ArrowLeft size={16} /> Back to Working Papers</Link>
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
        <div className="min-w-0"><p className="text-label-md text-on-surface-variant">Working Paper Details &amp; Evidence Particulars</p><h1 className="mt-1 flex min-w-0 items-center gap-3 break-words text-display-lg text-on-surface"><FileText className="shrink-0" /> {document.title}</h1><p className="mt-2 text-body-md text-on-surface-variant">{document.file_type.toUpperCase()} · {formatFileSize(document.file_size)} · Uploaded {formatDate(document.created_at)}</p></div>
        <div className="flex flex-wrap gap-2"><span className={`h-fit rounded-full px-2 py-1 text-xs font-medium capitalize ${statusStyles[document.status]}`}>{document.status}</span>{document.status === "failed" && <button type="button" disabled={isRetrying} onClick={() => void retry()} className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-body-sm font-medium text-primary hover:bg-primary-container disabled:opacity-60"><RotateCcw size={16} /> {isRetrying ? "Retrying..." : "Retry"}</button>}<button type="button" disabled={isDeleting} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-medium text-error hover:bg-error-container disabled:opacity-60"><Trash2 size={16} /> Delete</button></div>
      </header>
      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
      {document.status === "failed" && <section className="rounded-[20px] border border-error/30 bg-error-container p-5 text-on-error-container"><p className="flex items-center gap-2 font-medium"><AlertTriangle size={18} /> Processing failed</p><p className="mt-2 text-body-sm">{document.processing_error || "The file could not be processed. Retry after checking that it is readable."}</p></section>}
      {["pending", "processing"].includes(document.status) && <section className="rounded-[20px] border border-primary/30 bg-primary-container/20 p-5 text-body-md text-on-primary-container">Processing is underway. This page updates automatically when the extracted evidence is ready.</section>}
      {document.status === "completed" && <><section className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Pages</p><p className="mt-1 text-title-lg font-medium text-on-surface">{document.page_count ?? "-"}</p></div><div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Words</p><p className="mt-1 text-title-lg font-medium text-on-surface">{document.word_count ?? "-"}</p></div><div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"><p className="text-body-sm text-on-surface-variant">Audit Review</p><button type="button" onClick={() => void startStudy()} disabled={isStudying} className="mt-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-60">{isStudying ? "Reviewing..." : "Verify Audit Evidence"}</button></div></section>{study && <section className="rounded-[20px] border border-primary/30 bg-primary-container/20 p-6"><p className="text-label-md text-on-primary-container">Audit Evidence Verification &amp; Query Review · {study.topic}</p><h2 className="mt-2 text-headline-sm text-on-primary-container">{study.prompt}</h2><textarea aria-label="Your explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Document audit findings, verification methodology (SA 500), and statutory conclusions..." className="mt-4 min-h-36 w-full rounded-lg border border-outline-variant bg-surface p-3 text-sm" />{!feedback && <button type="button" onClick={() => void submitExplanation()} disabled={isStudying || explanation.trim().length < 20} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60">{isStudying ? "Evaluating..." : "Verify Audit Evidence & Assessment"}</button>}{feedback && <div className="mt-5 space-y-3 text-sm text-on-surface"><p className="text-2xl font-semibold">Audit Compliance Score: {Math.round(feedback.score)}/100</p><p>{feedback.feedback}</p><p><strong>Audit Strengths:</strong> {feedback.strengths.join(", ") || "Adequate documentation."}</p><p><strong>Missing Audit Disclosures:</strong> {feedback.missing_concepts.join(", ") || "None identified."}</p><p><strong>Exceptions / Misstatements:</strong> {feedback.misconceptions.join(", ") || "None identified."}</p><p><strong>Next Review Cycle:</strong> {feedback.revision_recommendation}</p></div>}</section>}

      {history.length > 0 && (
        <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="text-headline-sm text-on-surface">Audit Query Review History ({history.length})</h2>
          <div className="mt-4 space-y-4">
            {history.map((item, idx) => (
              <div key={item.session_id || idx} className="rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-body-md text-on-surface">Review #{history.length - idx}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{Math.round(item.score)}/100</span>
                </div>
                <p className="text-body-sm text-on-surface-variant">{item.feedback}</p>
                {item.missing_concepts.length > 0 && (
                  <p className="text-xs text-on-surface-variant"><strong className="text-on-surface">Missing Disclosures:</strong> {item.missing_concepts.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6"><h2 className="text-headline-sm text-on-surface">Extracted information preview</h2>{document.summary && <p className="mt-3 whitespace-pre-wrap break-words text-body-md text-on-surface-variant">{document.summary}</p>}{document.preview_chunks.length > 0 && <div className="mt-5 space-y-3">{document.preview_chunks.map((chunk) => <article key={chunk.id} className="rounded-lg border border-outline-variant bg-surface-container-low p-4"><p className="text-label-sm text-on-surface-variant">Excerpt {chunk.chunk_index + 1}{chunk.page_number ? ` · Page ${chunk.page_number}` : ""}</p><p className="mt-2 whitespace-pre-wrap break-words text-body-sm text-on-surface">{chunk.content}</p></article>)}</div>}</section></>}
    </div>
  );
}
