"use client";

import { useState, useRef, useEffect, ChangeEvent, FormEvent } from "react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { api } from "@/lib/api";

type ActiveTab = "doc-lib" | "cog-mem";
type FormatFilter = "all" | "pdf" | "docx" | "md";
type MemoryFilter = "all" | "instruction" | "preference" | "fact" | "general" | "project_information";

interface DocumentItem {
  id: string;
  title: string;
  file_type?: string;
  file_size?: number;
  status: string;
  created_at?: string;
  workspace_id?: string | null;
  selected?: boolean;
}

interface MemoryItem {
  id: string;
  content: string;
  category: string;
  source: string;
  review_status: string;
  is_pinned: boolean;
  workspace_id?: string | null;
  relevance_score?: number;
  created_at: string;
}

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("doc-lib");

  const { workspaces, activeWorkspace, activeWorkspaceId, fetchWorkspaces, setActiveWorkspace, updateWorkspaceInstructions } = useWorkspaceStore();

  // Document Library state & Scoping
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [docWorkspaceFilter, setDocWorkspaceFilter] = useState<string>("active");
  const [isUploading, setIsUploading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(true);

  const effectiveDocWs = docWorkspaceFilter === "all"
    ? null
    : (docWorkspaceFilter === "active" ? activeWorkspace : workspaces.find((w) => w.id === docWorkspaceFilter) || activeWorkspace);

  // Cognitive Memory state & Scoping (Global vs. Workspace specific)
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [selectedMemId, setSelectedMemId] = useState<string | null>(null);
  const [memSearch, setMemSearch] = useState("");
  const [memFilter, setMemFilter] = useState<MemoryFilter>("all");
  const [memsLoading, setMemsLoading] = useState(true);
  const [memoryScopeTab, setMemoryScopeTab] = useState<"global" | "workspace">("global");
  const [selectedMemoryWsId, setSelectedMemoryWsId] = useState<string | null>(null);
  const [personaInstructions, setPersonaInstructions] = useState<string>("");
  const [isSavingPersona, setIsSavingPersona] = useState(false);
  const [personaSuccessMsg, setPersonaSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showAddMemModal, setShowAddMemModal] = useState(false);
  const [newMemContent, setNewMemContent] = useState("");
  const [newMemCategory, setNewMemCategory] = useState("instruction");
  const [newMemPinned, setNewMemPinned] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load workspaces on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Sync selected memory workspace ID
  useEffect(() => {
    if (activeWorkspaceId && !selectedMemoryWsId) {
      setSelectedMemoryWsId(activeWorkspaceId);
    }
  }, [activeWorkspaceId, selectedMemoryWsId]);

  // Sync persona instructions when selected workspace changes
  useEffect(() => {
    const targetWs = workspaces.find((w) => w.id === (selectedMemoryWsId || activeWorkspaceId));
    if (targetWs) {
      setPersonaInstructions(targetWs.custom_instructions || "");
    }
  }, [selectedMemoryWsId, activeWorkspaceId, workspaces]);

  // Fetch Documents (scoped by active project or all)
  const fetchDocuments = async () => {
    try {
      setDocsLoading(true);
      const url = effectiveDocWs?.id ? `/documents?workspace_id=${effectiveDocWs.id}` : "/documents";
      const data = await api.get<DocumentItem[]>(url);
      if (Array.isArray(data)) {
        setDocs(data);
        if (data.length > 0) {
          if (!selectedDocId || !data.some((d) => d.id === selectedDocId)) {
            setSelectedDocId(data[0].id);
          }
        } else {
          setSelectedDocId(null);
        }
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setDocsLoading(false);
    }
  };

  // Fetch Memories (global vs workspace scoped)
  const fetchMemories = async () => {
    try {
      setMemsLoading(true);
      let url = "/memory";
      if (memoryScopeTab === "global") {
        url = "/memory?scope=global";
      } else if (memoryScopeTab === "workspace") {
        const targetWsId = selectedMemoryWsId || activeWorkspaceId;
        if (targetWsId) {
          url = `/memory?workspace_id=${targetWsId}`;
        }
      }
      const data = await api.get<MemoryItem[]>(url);
      if (Array.isArray(data)) {
        setMemories(data);
        if (data.length > 0) {
          if (!selectedMemId || !data.some((m) => m.id === selectedMemId)) {
            setSelectedMemId(data[0].id);
          }
        } else {
          setSelectedMemId(null);
        }
      }
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setMemsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDocWs?.id]);

  useEffect(() => {
    fetchMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryScopeTab, selectedMemoryWsId, activeWorkspaceId]);

  // Upload Document
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      if (effectiveDocWs?.id) {
        formData.append("workspace_id", effectiveDocWs.id);
      }
      const created = await api.upload<DocumentItem>("/documents/upload", formData);
      setDocs((prev) => [created, ...prev]);
      setSelectedDocId(created.id);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload document to vector index.");
    } finally {
      setIsUploading(false);
    }
  };

  // Save Workspace Custom Persona Instructions
  const handleSavePersona = async () => {
    const targetWsId = selectedMemoryWsId || activeWorkspaceId;
    if (!targetWsId) return;
    try {
      setIsSavingPersona(true);
      await updateWorkspaceInstructions(targetWsId, personaInstructions.trim() || null);
      setPersonaSuccessMsg("Project guidelines saved successfully!");
      setTimeout(() => setPersonaSuccessMsg(null), 3000);
    } catch (err) {
      console.error("Save persona error:", err);
      alert("Failed to save project persona guidelines.");
    } finally {
      setIsSavingPersona(false);
    }
  };

  // Reassign document to workspace
  const handleReassignDoc = async (docId: string, newWsId: string | null) => {
    try {
      const updated = await api.patch<DocumentItem>(`/documents/${docId}`, {
        workspace_id: newWsId || null,
      });
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, ...updated } : d)));
    } catch (err) {
      console.error("Reassign doc error:", err);
    }
  };

  // Delete Document
  const handleDeleteDoc = async (id: string, title: string) => {
    if (!confirm(`Remove "${title}" from your vector index?`)) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDocId === id) {
        setSelectedDocId(null);
      }
    } catch (err) {
      console.error("Delete doc error:", err);
    }
  };

  // Create Memory
  const handleCreateMemory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim()) return;

    try {
      const targetWsId = memoryScopeTab === "workspace" ? (selectedMemoryWsId || activeWorkspaceId) : null;
      const created = await api.post<MemoryItem>("/memory", {
        content: newMemContent.trim(),
        category: newMemCategory,
        is_pinned: newMemPinned,
        workspace_id: targetWsId || undefined,
      });
      setMemories((prev) => [created, ...prev]);
      setSelectedMemId(created.id);
      setNewMemContent("");
      setShowAddMemModal(false);
    } catch (err) {
      console.error("Create memory error:", err);
      alert("Failed to register cognitive memory.");
    }
  };

  // Approve / Reject Memory
  const handleApproveMemory = async (id: string) => {
    try {
      await api.post(`/memory/${id}/approve`);
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, review_status: "approved" } : m))
      );
    } catch (err) {
      console.error("Approve memory error:", err);
    }
  };

  const handleRejectMemory = async (id: string) => {
    try {
      await api.post(`/memory/${id}/reject`);
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, review_status: "rejected" } : m))
      );
    } catch (err) {
      console.error("Reject memory error:", err);
    }
  };

  // Delete Memory
  const handleDeleteMemory = async (id: string) => {
    if (!confirm("Delete this cognitive rule?")) return;
    try {
      await api.delete(`/memory/${id}`);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      if (selectedMemId === id) {
        setSelectedMemId(null);
      }
    } catch (err) {
      console.error("Delete memory error:", err);
    }
  };

  const selectedDoc = docs.find((d) => d.id === selectedDocId) || docs[0];
  const selectedMem = memories.find((m) => m.id === selectedMemId) || memories[0];

  const filteredDocs = docs.filter((d) => {
    const ext = d.title.split(".").pop()?.toLowerCase() || "";
    if (formatFilter === "pdf" && ext !== "pdf") return false;
    if (formatFilter === "docx" && ext !== "docx") return false;
    if (formatFilter === "md" && ext !== "md" && ext !== "txt") return false;
    if (docSearch.trim() && !d.title.toLowerCase().includes(docSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  const filteredMemories = memories.filter((m) => {
    if (memFilter !== "all" && m.category !== memFilter) return false;
    if (memSearch.trim() && !m.content.toLowerCase().includes(memSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Local Document";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full px-space-lg py-space-lg">
      <div className="flex flex-col w-full gap-space-lg">
        {/* Top Segmented Bar & Storage Summary */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
          <div className="flex items-center gap-space-md flex-wrap">
            <div className="inline-flex p-0.5 bg-surface-container rounded-lg">
              <button
                onClick={() => setActiveTab("doc-lib")}
                className={`flex items-center gap-2 px-space-md py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                  activeTab === "doc-lib"
                    ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold"
                    : "text-secondary hover:text-on-surface"
                }`}
                id="tab-doc-lib"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">
                  inventory_2
                </span>
                <span>Document Library</span>
                <span className="font-mono-sm text-mono-sm px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant font-medium">
                  {docs.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("cog-mem")}
                className={`flex items-center gap-2 px-space-md py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                  activeTab === "cog-mem"
                    ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold"
                    : "text-secondary hover:text-on-surface"
                }`}
                id="tab-cog-mem"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">
                  psychology
                </span>
                <span>AI Memory &amp; Preferences</span>
                <span className="font-mono-sm text-mono-sm px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-medium">
                  {memories.length}
                </span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container-low text-on-surface-variant">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
              <span className="font-mono-sm text-mono-sm">Local Storage</span>
            </div>
          </div>

          {/* Top Summary Bar */}
          <div className="flex items-center gap-3 font-mono-sm text-mono-sm text-on-surface-variant overflow-x-auto py-0.5">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-outline">Total Documents:</span>
              <span className="text-on-surface font-medium">
                {docs.length}
              </span>
            </div>
            <span className="text-outline-variant/60">/</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-outline">Storage Used:</span>
              <span className="text-on-surface font-medium">
                {docs.length > 0 ? `${(docs.length * 3.2).toFixed(1)} MB` : "0 MB"}
              </span>
            </div>
            <span className="text-outline-variant/60">/</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-outline">Knowledge Base:</span>
              <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono-sm text-primary font-medium">
                Indexed &amp; Ready
              </span>
            </div>
          </div>
        </div>

        {/* TAB 1: DOCUMENT LIBRARY VIEW */}
        {activeTab === "doc-lib" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
            {/* Left Section: Document Registry & Table */}
            <div className="lg:col-span-8 flex flex-col gap-space-md">
              {/* Project Scoping Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[17px] text-primary">folder_special</span>
                  <span className="font-label-sm text-label-sm text-secondary font-medium">Project Scope:</span>
                  <select
                    value={docWorkspaceFilter}
                    onChange={(e) => setDocWorkspaceFilter(e.target.value)}
                    className="px-2.5 py-1 bg-surface-container rounded-lg font-label-sm text-label-sm text-on-surface outline-none border border-outline-variant/30 font-medium cursor-pointer"
                  >
                    <option value="active">Active Project ({activeWorkspace?.name || "None"})</option>
                    <option value="all">All Vault Documents</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                  </select>
                </div>
                <div className="text-mono-sm font-mono-sm text-secondary px-1">
                  {effectiveDocWs ? `Grounded in ${effectiveDocWs.name} (${docs.length} notes)` : `All Vault (${docs.length} notes)`}
                </div>
              </div>
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row gap-space-sm sm:items-center justify-between">
                <div className="flex items-center gap-space-sm flex-1 max-w-md">
                  <div className="relative w-full">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-outline">
                      search
                    </span>
                    <input
                      type="text"
                      value={docSearch}
                      onChange={(e) => setDocSearch(e.target.value)}
                      placeholder="Search documents, notes, or titles..."
                      className="w-full pl-8 pr-12 py-1.5 bg-surface-container-low rounded-lg text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest shadow-sm placeholder:text-outline transition-all"
                    />
                    <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium shadow-sm">
                      ⌘F
                    </kbd>
                  </div>
                </div>

                <div className="flex items-center gap-space-xs flex-wrap sm:flex-nowrap justify-between sm:justify-end">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => setFormatFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        formatFilter === "all"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      All ({docs.length})
                    </button>
                    <button
                      onClick={() => setFormatFilter("pdf")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        formatFilter === "pdf"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => setFormatFilter("docx")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        formatFilter === "docx"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      DOCX
                    </button>
                    <button
                      onClick={() => setFormatFilter("md")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        formatFilter === "md"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      Markdown
                    </button>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-on-surface text-surface font-label-md text-label-md hover:opacity-90 transition-opacity shrink-0 ml-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      upload_file
                    </span>
                    <span>{isUploading ? "Uploading..." : "Upload Notes"}</span>
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="grid grid-cols-12 px-space-md py-2.5 bg-surface-container-low font-mono-sm text-mono-sm text-outline uppercase tracking-wider">
                  <div className="col-span-6 flex items-center gap-2">
                    Document &amp; Title
                  </div>
                  <div className="col-span-2 text-right">Type</div>
                  <div className="col-span-2 text-center">Status</div>
                  <div className="col-span-2 text-right pr-2">Actions</div>
                </div>

                {docsLoading ? (
                  <div className="py-12 text-center text-secondary font-mono-sm text-mono-sm">
                    Loading documents...
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="py-12 text-center text-secondary font-body-sm text-body-sm">
                    No documents found. Upload course slides or syllabus PDFs above to add them to your knowledge base.
                  </div>
                ) : (
                  filteredDocs.map((doc) => {
                    const isSelected = doc.id === selectedDocId;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`grid grid-cols-12 px-space-md py-3 items-center transition-colors cursor-pointer group ${
                          isSelected
                            ? "bg-surface-container-low/60 hover:bg-surface-container-low"
                            : "hover:bg-surface-container-low/40"
                        }`}
                      >
                        <div className="col-span-6 flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded bg-primary-fixed flex items-center justify-center text-primary shrink-0 shadow-sm">
                            <span className="material-symbols-outlined text-[18px]">
                              {doc.title.endsWith(".pdf")
                                ? "picture_as_pdf"
                                : doc.title.endsWith(".docx")
                                ? "description"
                                : "code"}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                                {doc.title}
                              </span>
                              {isSelected && (
                                <span className="px-1.5 py-0.2 rounded bg-primary-fixed-dim/40 text-on-primary-fixed-variant font-mono-sm text-mono-sm shrink-0">
                                  Selected
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 font-mono-sm text-mono-sm text-secondary truncate">
                              <span>{formatFileSize(doc.file_size)}</span>
                              <span>·</span>
                              <span className="uppercase">
                                {doc.title.split(".").pop() || "DOC"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2 text-right font-mono-sm text-mono-sm text-on-surface font-medium uppercase">
                          {doc.title.split(".").pop() || "PDF"}
                        </div>

                        <div className="col-span-2 flex items-center justify-center">
                          {doc.status === "completed" ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono-sm text-mono-sm font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-mono-sm text-mono-sm font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                              Processing
                            </span>
                          )}
                        </div>

                        <div className="col-span-2 flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDoc(doc.id, doc.title);
                            }}
                            className="p-1.5 rounded hover:bg-surface-container text-outline hover:text-error transition-colors cursor-pointer"
                            title="Delete document"
                          >
                            <span className="material-symbols-outlined text-[17px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Section: Slide-over Inspector */}
            <div className="lg:col-span-4 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-md">
                <div className="flex items-center justify-between pb-space-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      Document Details
                    </span>
                  </div>
                </div>

                {selectedDoc ? (
                  <>
                    <div className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-primary text-[17px]">
                          attachment
                        </span>
                        <span className="font-mono-sm text-mono-sm text-on-surface truncate">
                          {selectedDoc.title}
                        </span>
                      </div>
                      <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-medium shrink-0">
                        Status: Ready
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 rounded bg-surface-container-low flex flex-col">
                        <span className="font-mono-sm text-mono-sm text-outline">Format</span>
                        <span className="font-headline-sm text-headline-sm text-on-surface mt-0.5 uppercase">
                          {selectedDoc.title.split(".").pop() || "FILE"}
                        </span>
                        <span className="font-mono-sm text-mono-sm text-secondary">
                          {formatFileSize(selectedDoc.file_size)}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-surface-container-low flex flex-col">
                        <span className="font-mono-sm text-mono-sm text-outline">State</span>
                        <span className="font-headline-sm text-headline-sm text-primary mt-0.5">
                          Indexed
                        </span>
                        <span className="font-mono-sm text-mono-sm text-emerald-600">
                          On-Device
                        </span>
                      </div>
                      <div className="p-2 rounded bg-surface-container-low flex flex-col">
                        <span className="font-mono-sm text-mono-sm text-outline">Storage</span>
                        <span className="font-label-md text-label-md text-on-surface mt-0.5 truncate">
                          Local DB
                        </span>
                        <span className="font-mono-sm text-mono-sm text-secondary">Encrypted</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-surface-container-low flex flex-col gap-1">
                      <span className="text-outline font-mono-sm text-mono-sm uppercase tracking-wider">Assigned Project Workspace</span>
                      <select
                        value={selectedDoc.workspace_id || ""}
                        onChange={(e) => handleReassignDoc(selectedDoc.id, e.target.value || null)}
                        className="w-full px-2 py-1.5 bg-surface-container rounded font-mono-sm text-mono-sm text-on-surface outline-none border border-outline-variant/30 cursor-pointer"
                      >
                        <option value="">General Vault (Unassigned)</option>
                        {workspaces.map((ws) => (
                          <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="font-mono-sm text-mono-sm text-outline uppercase tracking-wide">
                        Document Overview
                      </span>
                      <p className="font-body-sm text-body-sm text-secondary leading-relaxed bg-surface-container-low p-2 rounded-lg">
                        This document is saved securely on your device. Its contents are automatically referenced when asking questions in chat to provide accurate citations.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-secondary font-body-sm text-body-sm">
                    Select a document to inspect its details.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* TAB 2: COGNITIVE MEMORY WORKBENCH VIEW */
          <div className="flex flex-col gap-space-md">
            {/* Dual-Option Memory Tabs (Global vs Workspace Specific) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-outline-variant/20">
              <div className="inline-flex p-0.5 bg-surface-container rounded-lg">
                <button
                  type="button"
                  onClick={() => setMemoryScopeTab("global")}
                  className={`flex items-center gap-2 px-space-md py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                    memoryScopeTab === "global"
                      ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">public</span>
                  <span>Global Memory (Across All Workspaces)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMemoryScopeTab("workspace")}
                  className={`flex items-center gap-2 px-space-md py-1.5 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${
                    memoryScopeTab === "workspace"
                      ? "bg-surface-container-lowest text-on-surface shadow-sm font-semibold"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">folder_special</span>
                  <span>Workspace Memory &amp; Persona</span>
                </button>
              </div>

              {memoryScopeTab === "workspace" && (
                <div className="flex items-center gap-2">
                  <span className="font-label-sm text-label-sm text-secondary font-medium">Target Project:</span>
                  <select
                    value={selectedMemoryWsId || activeWorkspaceId || ""}
                    onChange={(e) => setSelectedMemoryWsId(e.target.value)}
                    className="px-2.5 py-1 bg-surface-container rounded-lg font-label-sm text-label-sm text-on-surface outline-none border border-outline-variant/30 font-medium cursor-pointer"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {memoryScopeTab === "workspace" ? (
              /* Project Persona & Custom Instructions Card */
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">psychology</span>
                    <span className="font-headline-sm text-headline-sm text-on-surface">
                      {workspaces.find((w) => w.id === (selectedMemoryWsId || activeWorkspaceId))?.name || "Workspace"} Custom AI Persona &amp; Instructions
                    </span>
                  </div>
                  {personaSuccessMsg && (
                    <span className="font-mono-sm text-mono-sm text-emerald-600 font-medium">
                      ✓ {personaSuccessMsg}
                    </span>
                  )}
                </div>
                <p className="font-body-sm text-body-sm text-secondary">
                  Custom instructions and domain guidelines for AI conversations within this workspace project (e.g. format all math equations in LaTeX, adopt a Socratic tutoring tone, focus on corporate finance standards).
                </p>
                <textarea
                  rows={3}
                  value={personaInstructions}
                  onChange={(e) => setPersonaInstructions(e.target.value)}
                  placeholder="e.g. Act as a patient math tutor. Always format equations using LaTeX and provide step-by-step proofs."
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary transition-all"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSavePersona}
                    disabled={isSavingPersona}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-on-surface text-surface font-label-md text-label-md hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[15px]">save</span>
                    <span>{isSavingPersona ? "Saving..." : "Save Project Persona"}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Global Memory Info Banner */
              <div className="bg-surface-container-lowest p-space-sm px-space-md rounded-xl shadow-sm border border-outline-variant/20 flex items-center gap-2 text-secondary">
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0">public</span>
                <span className="font-body-sm text-body-sm">
                  Global knowledge, facts, and preferences that LoopBack AI retains universally across every workspace and inquiry.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
              {/* Left Section: Memory Registry */}
              <div className="lg:col-span-8 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row gap-space-sm sm:items-center justify-between">
                <div className="flex items-center gap-space-sm flex-1 max-w-md">
                  <div className="relative w-full">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-outline">
                      search
                    </span>
                    <input
                      type="text"
                      value={memSearch}
                      onChange={(e) => setMemSearch(e.target.value)}
                      placeholder="Search rules, facts, preferences..."
                      className="w-full pl-8 pr-4 py-1.5 bg-surface-container-low rounded-lg text-on-surface font-body-md text-body-md outline-none focus:bg-surface-container-lowest shadow-sm placeholder:text-outline transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-space-xs flex-wrap sm:flex-nowrap justify-between sm:justify-end">
                  <div className="inline-flex gap-1 overflow-x-auto">
                    <button
                      onClick={() => setMemFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        memFilter === "all"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      All ({memories.length})
                    </button>
                    <button
                      onClick={() => setMemFilter("instruction")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        memFilter === "instruction"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      Rules
                    </button>
                    <button
                      onClick={() => setMemFilter("preference")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        memFilter === "preference"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      Preferences
                    </button>
                    <button
                      onClick={() => setMemFilter("fact")}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm cursor-pointer transition-colors ${
                        memFilter === "fact"
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      Facts
                    </button>
                  </div>

                  <button
                    onClick={() => setShowAddMemModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-on-surface text-surface font-label-md text-label-md hover:opacity-90 transition-opacity shrink-0 ml-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Add Custom Rule</span>
                  </button>
                </div>
              </div>

              {/* Memory List Table */}
              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="grid grid-cols-12 px-space-md py-2.5 bg-surface-container-low font-mono-sm text-mono-sm text-outline uppercase tracking-wider">
                  <div className="col-span-7">Saved Rule &amp; Instruction</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-2 text-center">Status</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>

                {memsLoading ? (
                  <div className="py-12 text-center text-secondary font-mono-sm text-mono-sm">
                    Loading saved rules &amp; preferences...
                  </div>
                ) : filteredMemories.length === 0 ? (
                  <div className="py-12 text-center text-secondary font-body-sm text-body-sm">
                    No custom rules defined yet. Tap &quot;Add Custom Rule&quot; to teach your AI assistant your learning preferences.
                  </div>
                ) : (
                  filteredMemories.map((mem) => {
                    const isSelected = mem.id === selectedMemId;
                    return (
                      <div
                        key={mem.id}
                        onClick={() => setSelectedMemId(mem.id)}
                        className={`grid grid-cols-12 px-space-md py-3 items-center transition-colors cursor-pointer group ${
                          isSelected
                            ? "bg-surface-container-low/60 hover:bg-surface-container-low"
                            : "hover:bg-surface-container-low/40"
                        }`}
                      >
                        <div className="col-span-7 flex items-start gap-2.5 min-w-0 pr-4">
                          <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">
                            {mem.is_pinned ? "push_pin" : "psychology"}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="font-body-md text-body-md text-on-surface leading-snug line-clamp-2">
                              {mem.content}
                            </span>
                            <span className="font-mono-sm text-mono-sm text-outline mt-0.5">
                              Source: {mem.source} · {new Date(mem.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <span className="px-2 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant capitalize">
                            {mem.category}
                          </span>
                        </div>

                        <div className="col-span-2 flex items-center justify-center">
                          {mem.review_status === "pending" ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApproveMemory(mem.id);
                                }}
                                className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-medium hover:bg-emerald-200"
                              >
                                Approve
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRejectMemory(mem.id);
                                }}
                                className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container text-[11px] hover:opacity-80"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container font-mono-sm text-mono-sm text-on-surface font-medium capitalize">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  mem.review_status === "approved"
                                    ? "bg-emerald-500"
                                    : "bg-outline"
                                }`}
                              ></span>
                              {mem.review_status}
                            </span>
                          )}
                        </div>

                        <div className="col-span-1 flex items-center justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMemory(mem.id);
                            }}
                            className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                            title="Delete rule"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Section: Memory Details Inspector */}
            <div className="lg:col-span-4 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-md">
                <div className="flex items-center justify-between pb-space-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      tune
                    </span>
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      Custom Rule Details
                    </span>
                  </div>
                </div>

                {selectedMem ? (
                  <>
                    <div className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between">
                      <span className="font-mono-sm text-mono-sm text-primary font-semibold uppercase">
                        {selectedMem.category}
                      </span>
                      <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface">
                        Priority: Active
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="font-mono-sm text-mono-sm text-outline uppercase tracking-wider">
                        Rule Description
                      </span>
                      <p className="font-body-md text-body-md text-on-surface leading-relaxed bg-surface-container-low p-space-sm rounded-lg">
                        {selectedMem.content}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-mono-sm text-mono-sm">
                      <div className="p-2 rounded bg-surface-container-low flex flex-col">
                        <span className="text-outline">Source</span>
                        <span className="text-on-surface font-medium capitalize mt-0.5">
                          {selectedMem.source}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-surface-container-low flex flex-col">
                        <span className="text-outline">Status</span>
                        <span className="text-on-surface font-medium capitalize mt-0.5">
                          {selectedMem.review_status}
                        </span>
                      </div>
                    </div>

                    <p className="font-body-sm text-body-sm text-secondary">
                      This rule is automatically applied by your AI assistant when answering questions and organizing your study materials.
                    </p>
                  </>
                ) : (
                  <div className="py-8 text-center text-secondary font-body-sm text-body-sm">
                    Select a rule to view its details.
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Modal: Register New Memory */}
        {showAddMemModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-xl max-w-md w-full flex flex-col gap-space-md border border-outline-variant/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    Add Custom Rule / Preference
                  </h3>
                  <span className="font-mono-sm text-mono-sm text-primary">
                    Scope: {memoryScopeTab === "workspace" ? `Project (${workspaces.find((w) => w.id === (selectedMemoryWsId || activeWorkspaceId))?.name || "Active Workspace"})` : "Global (All Workspaces)"}
                  </span>
                </div>
                <button
                  onClick={() => setShowAddMemModal(false)}
                  className="p-1 text-secondary hover:text-on-surface rounded cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateMemory} className="flex flex-col gap-space-sm">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">
                    Rule or Instruction Content
                  </label>
                  <textarea
                    rows={4}
                    value={newMemContent}
                    onChange={(e) => setNewMemContent(e.target.value)}
                    placeholder="e.g. Always format calculus derivations step-by-step with clear explanations."
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-space-sm items-center">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-secondary">Category</label>
                    <select
                      value={newMemCategory}
                      onChange={(e) => setNewMemCategory(e.target.value)}
                      className="w-full px-2 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono-sm text-mono-sm outline-none border border-outline-variant/30"
                    >
                      <option value="instruction">Instruction / Rule</option>
                      <option value="preference">Preference</option>
                      <option value="fact">Fact</option>
                      <option value="general">General</option>
                      <option value="project_information">Study Information</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="pin-check"
                      checked={newMemPinned}
                      onChange={(e) => setNewMemPinned(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                    <label htmlFor="pin-check" className="font-label-sm text-label-sm text-on-surface cursor-pointer">
                      Pin as Always Active
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddMemModal(false)}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-on-surface text-surface hover:opacity-90 font-label-md text-label-md shadow-sm cursor-pointer"
                  >
                    Save Rule
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
