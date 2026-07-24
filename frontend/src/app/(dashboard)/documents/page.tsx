"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  File,
  FileText,
  Info,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type DocumentStatus = "pending" | "processing" | "completed" | "failed";

interface DocumentData {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
  status: DocumentStatus;
  summary?: string | null;
  page_count?: number | null;
  word_count?: number | null;
  created_at: string;
  updated_at: string;
}

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
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<DocumentData | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [retryingDocumentId, setRetryingDocumentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    const data = await api.get<DocumentData[]>("/documents");
    setDocuments(data);
    setSelectedDocument((current) => current ? data.find((document) => document.id === current.id) ?? null : null);
  };

  useEffect(() => {
    void loadDocuments()
      .catch(() => setError("Could not load documents."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!documents.some((document) => document.status === "pending" || document.status === "processing")) return;
    const interval = window.setInterval(() => {
      void loadDocuments().catch(() => setError("Could not refresh document status."));
    }, 3000);
    return () => window.clearInterval(interval);
  }, [documents]);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const createdDocument = await api.upload<DocumentData>("/documents/upload", formData);
      setDocuments((current) => [createdDocument, ...current]);
    } catch {
      setError("Could not upload this file. Check that it is a supported file type and within the size limit.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrag = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === "dragenter" || event.type === "dragover");
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void uploadFile(file);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
  };

  const deleteDocument = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    setError("");
    try {
      await api.delete(`/documents/${documentToDelete.id}`);
      setDocuments((current) => current.filter((document) => document.id !== documentToDelete.id));
      setSelectedDocument((current) => current?.id === documentToDelete.id ? null : current);
      setDocumentToDelete(null);
    } catch {
      setError("Could not delete document. It is still visible in your library.");
    } finally {
      setIsDeleting(false);
    }
  };

  const retryDocument = async (document: DocumentData) => {
    setRetryingDocumentId(document.id);
    setError("");
    try {
      const retriedDocument = await api.post<DocumentData>(`/documents/${document.id}/retry`);
      setDocuments((current) => current.map((item) => item.id === retriedDocument.id ? retriedDocument : item));
    } catch {
      setError("Could not restart document processing. Please try again.");
    } finally {
      setRetryingDocumentId(null);
    }
  };

  return (
    <div className="neo-documents flex flex-1 flex-col gap-8">
      <header className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
        <p className="text-label-md text-on-surface-variant">Documents</p>
        <h1 className="mt-1 flex items-center gap-3 text-display-lg text-on-surface"><FileText /> Knowledge, ready when you need it.</h1>
        <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">Upload PDFs, text files, Markdown, or images. LoopBack keeps their processing state visible as they become available to your workspace.</p>
      </header>

      <section
        className={`neo-upload-dropzone rounded-[20px] border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${dragActive ? "border-primary bg-primary-container/10" : "border-outline-variant bg-surface-container-lowest"}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto mb-4 h-12 w-12 text-on-surface-variant" />
        <h2 className="text-headline-sm text-on-surface">{isUploading ? "Uploading document..." : "Drag and drop a document"}</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">PDF, TXT, Markdown, PNG, JPG, and JPEG up to the configured upload limit.</p>
        <input type="file" ref={fileInputRef} onChange={handleChange} className="hidden" accept=".pdf,.txt,.md,.png,.jpeg,.jpg" aria-label="Choose document file" />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"><Upload size={16} /> {isUploading ? "Uploading..." : "Browse files"}</button>
      </section>

      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}

      <section className="neo-document-library rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-headline-md text-on-surface">Your documents</h2><span className="text-body-sm text-on-surface-variant">{documents.length} total</span></div>
        {isLoading ? (
          <p className="py-12 text-center text-body-md text-on-surface-variant">Loading documents...</p>
        ) : documents.length === 0 ? (
          <div className="py-12 text-center"><File className="mx-auto mb-4 h-12 w-12 text-on-surface-variant/50" /><p className="text-body-lg text-on-surface">No documents uploaded yet.</p><p className="mt-1 text-body-md text-on-surface-variant">Upload files to start building your knowledge base.</p></div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {documents.map((document) => (
              <article key={document.id} className="neo-document-card flex min-w-0 items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest text-on-surface"><File size={20} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><p className="break-words text-body-md font-medium text-on-surface">{document.title}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[document.status]}`}>{document.status}</span></div>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-body-sm text-on-surface-variant"><span>{document.file_type.toUpperCase()}</span><span>{formatFileSize(document.file_size)}</span><span>Uploaded {formatDate(document.created_at)}</span></p>
                  {document.status === "failed" && <p className="mt-2 inline-flex items-center gap-1 text-body-sm text-error"><AlertTriangle size={14} /> Processing failed. You can retry without uploading again.</p>}
                  {document.status === "processing" && <p className="mt-2 text-body-sm text-primary">Processing in the background...</p>}
                  <div className="mt-4 flex flex-wrap gap-2"><Link href={`/documents/${document.id}`} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-body-sm font-medium text-on-surface hover:bg-surface-container-high"><Info size={16} /> Details</Link>{document.status === "failed" && <button type="button" disabled={retryingDocumentId === document.id} onClick={() => void retryDocument(document)} className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-body-sm font-medium text-primary hover:bg-primary-container disabled:opacity-60"><RotateCcw size={16} /> {retryingDocumentId === document.id ? "Retrying..." : "Retry"}</button>}<button type="button" onClick={() => setDocumentToDelete(document)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-medium text-error hover:bg-error-container"><Trash2 size={16} /> Delete</button></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => setSelectedDocument(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="document-details-title" className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4"><h2 id="document-details-title" className="min-w-0 break-words text-title-md font-medium text-on-surface">{selectedDocument.title}</h2><button type="button" onClick={() => setSelectedDocument(null)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Close document details"><X size={18} /></button></div>
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2"><p className="text-body-sm text-on-surface-variant">File type<span className="mt-1 block font-medium uppercase text-on-surface">{selectedDocument.file_type}</span></p><p className="text-body-sm text-on-surface-variant">File size<span className="mt-1 block font-medium text-on-surface">{formatFileSize(selectedDocument.file_size)}</span></p><p className="text-body-sm text-on-surface-variant">Uploaded<span className="mt-1 inline-flex items-center gap-1 font-medium text-on-surface"><CalendarDays size={14} /> {formatDate(selectedDocument.created_at)}</span></p><p className="text-body-sm text-on-surface-variant">Status<span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[selectedDocument.status]}`}>{selectedDocument.status}</span></p></div>
              {selectedDocument.status === "failed" && <p className="rounded-lg bg-error-container p-3 text-body-sm text-on-error-container">Processing did not complete. The original file remains available in your library; upload a readable replacement if needed.</p>}
              {selectedDocument.status === "completed" && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><p className="text-body-sm text-on-surface-variant">Pages<span className="mt-1 block font-medium text-on-surface">{selectedDocument.page_count ?? "-"}</span></p><p className="text-body-sm text-on-surface-variant">Words<span className="mt-1 block font-medium text-on-surface">{selectedDocument.word_count ?? "-"}</span></p></div>{selectedDocument.summary && <div><h3 className="text-body-sm font-medium text-on-surface">Extracted overview</h3><p className="mt-1 whitespace-pre-wrap break-words text-body-sm text-on-surface-variant">{selectedDocument.summary}</p></div>}</div>}
            </div>
          </section>
        </div>
      )}

      {documentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => !isDeleting && setDocumentToDelete(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-document-title" className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="delete-document-title" className="text-title-md font-medium text-on-surface">Delete document?</h2><p className="mt-2 break-words text-body-sm text-on-surface-variant">This permanently removes &quot;{documentToDelete.title}&quot; and its processed content.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeleting} onClick={() => setDocumentToDelete(null)} className="rounded-lg px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high">Cancel</button><button type="button" disabled={isDeleting} onClick={() => void deleteDocument()} className="rounded-lg bg-error px-4 py-2 text-body-sm font-medium text-on-error disabled:opacity-60">{isDeleting ? "Deleting document..." : "Delete document"}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
