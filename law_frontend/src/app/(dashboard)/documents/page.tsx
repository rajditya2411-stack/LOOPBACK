"use client";

import { useState, useRef, useEffect, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
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

export default function PleadingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("doc-lib");

  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    fetchWorkspaces,
    setActiveWorkspace,
    updateWorkspaceInstructions,
  } = useWorkspaceStore();

  // Document Library state & Scoping
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [docWorkspaceFilter, setDocWorkspaceFilter] = useState<string>("active");
  const [isUploading, setIsUploading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(true);

  const effectiveDocWs =
    docWorkspaceFilter === "all"
      ? null
      : docWorkspaceFilter === "active"
      ? activeWorkspace
      : workspaces.find((w) => w.id === docWorkspaceFilter) || activeWorkspace;

  // Legal Knowledge & Rules state (Global vs Matter specific)
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

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (activeWorkspaceId && !selectedMemoryWsId) {
      setSelectedMemoryWsId(activeWorkspaceId);
    }
  }, [activeWorkspaceId, selectedMemoryWsId]);

  useEffect(() => {
    const targetWs = workspaces.find((w) => w.id === (selectedMemoryWsId || activeWorkspaceId));
    if (targetWs) {
      setPersonaInstructions(targetWs.custom_instructions || "");
    }
  }, [selectedMemoryWsId, activeWorkspaceId, workspaces]);

  // Fetch Documents
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
      console.error("Failed to load pleadings:", err);
    } finally {
      setDocsLoading(false);
    }
  };

  // Fetch Memories
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
      console.error("Failed to load legal rules:", err);
    } finally {
      setMemsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "doc-lib") {
      fetchDocuments();
    } else {
      fetchMemories();
    }
  }, [activeTab, effectiveDocWs?.id, memoryScopeTab, selectedMemoryWsId]);

  // Document Upload
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (effectiveDocWs?.id) {
        formData.append("workspace_id", effectiveDocWs.id);
      }
      const uploadedDoc = await api.upload<DocumentItem>("/documents/upload", formData);
      setDocs((prev) => [uploadedDoc, ...prev]);
      setSelectedDocId(uploadedDoc.id);
    } catch (err) {
      console.error("Pleading upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete Document
  const handleDeleteDoc = async (id: string) => {
    if (!confirm("Are you sure you want to remove this pleading from the vault?")) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDocId === id) {
        const remaining = docs.filter((d) => d.id !== id);
        setSelectedDocId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  // Add Memory
  const handleAddMemory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim()) return;

    try {
      const payload: any = {
        content: newMemContent.trim(),
        category: newMemCategory,
        is_pinned: newMemPinned,
      };
      if (memoryScopeTab === "workspace") {
        payload.workspace_id = selectedMemoryWsId || activeWorkspaceId;
      }
      const created = await api.post<MemoryItem>("/memory", payload);
      setMemories((prev) => [created, ...prev]);
      setSelectedMemId(created.id);
      setShowAddMemModal(false);
      setNewMemContent("");
    } catch (err) {
      console.error("Failed to add legal rule:", err);
    }
  };

  // Approve Memory
  const handleApproveMem = async (id: string) => {
    try {
      await api.post(`/memory/${id}/approve`);
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, review_status: "approved" } : m))
      );
    } catch (err) {
      console.error("Failed to approve memory:", err);
    }
  };

  // Reject Memory
  const handleRejectMem = async (id: string) => {
    try {
      await api.post(`/memory/${id}/reject`);
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, review_status: "rejected" } : m))
      );
    } catch (err) {
      console.error("Failed to reject memory:", err);
    }
  };

  // Delete Memory
  const handleDeleteMem = async (id: string) => {
    if (!confirm("Delete this legal rule?")) return;
    try {
      await api.delete(`/memory/${id}`);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      if (selectedMemId === id) {
        const remaining = memories.filter((m) => m.id !== id);
        setSelectedMemId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  // Save Persona Instructions
  const handleSavePersona = async () => {
    const targetWsId = selectedMemoryWsId || activeWorkspaceId;
    if (!targetWsId) return;

    setIsSavingPersona(true);
    setPersonaSuccessMsg(null);
    try {
      await updateWorkspaceInstructions(targetWsId, personaInstructions.trim() || null);
      setPersonaSuccessMsg("Chamber guidelines saved successfully.");
      setTimeout(() => setPersonaSuccessMsg(null), 3000);
    } catch (err) {
      console.error("Failed to save chamber guidelines:", err);
    } finally {
      setIsSavingPersona(false);
    }
  };

  // Filtered Docs
  const filteredDocs = docs.filter((doc) => {
    const matchesSearch =
      !docSearch.trim() ||
      doc.title.toLowerCase().includes(docSearch.toLowerCase());
    const matchesFormat =
      formatFilter === "all" ||
      (formatFilter === "pdf" && doc.title.endsWith(".pdf")) ||
      (formatFilter === "docx" && (doc.title.endsWith(".docx") || doc.title.endsWith(".doc"))) ||
      (formatFilter === "md" && doc.title.endsWith(".md"));
    return matchesSearch && matchesFormat;
  });

  const selectedDoc = docs.find((d) => d.id === selectedDocId) || null;

  // Filtered Memories
  const filteredMemories = memories.filter((mem) => {
    const matchesSearch =
      !memSearch.trim() ||
      mem.content.toLowerCase().includes(memSearch.toLowerCase());
    const matchesFilter =
      memFilter === "all" || mem.category === memFilter;
    return matchesSearch && matchesFilter;
  });

  const selectedMem = memories.find((m) => m.id === selectedMemId) || null;

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Top Header & Segmented Tab Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-md">
          <div className="space-y-1">
            <h1 className="font-headline text-headline-md text-on-surface">
              Pleadings, Briefs &amp; Chamber Knowledge
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Encrypted case repository for plaints, written statements, affidavits, and customized AI research rules.
            </p>
          </div>

          {/* Segmented Control */}
          <div className="flex items-center p-1 rounded-xl bg-surface-container-high border border-outline-variant/30 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("doc-lib")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "doc-lib"
                  ? "bg-surface text-on-surface shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">description</span>
              <span>Pleadings Library</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("cog-mem")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === "cog-mem"
                  ? "bg-surface text-on-surface shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">psychology</span>
              <span>Chamber Rules &amp; Precedents</span>
            </button>
          </div>
        </div>

        {/* TAB 1: Pleadings & Briefs Library */}
        {activeTab === "doc-lib" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            {/* Left Column: Pleading List (8 Cols) */}
            <div className="lg:col-span-8 space-y-space-md">
              {/* Controls Toolbar */}
              <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">
                      search
                    </span>
                    <input
                      type="text"
                      value={docSearch}
                      onChange={(e) => setDocSearch(e.target.value)}
                      placeholder="Search plaints, briefs, affidavits..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Scoping Selector */}
                  <select
                    value={docWorkspaceFilter}
                    onChange={(e) => setDocWorkspaceFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low text-on-surface shrink-0"
                  >
                    <option value="active">Active Docket ({activeWorkspace?.name || "None"})</option>
                    <option value="all">All Chamber Matters</option>
                    {workspaces
                      .filter((w) => w.id !== activeWorkspaceId)
                      .map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.txt"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    <span>{isUploading ? "Uploading..." : "Upload Pleading"}</span>
                  </button>
                </div>
              </div>

              {/* Documents List */}
              <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-space-sm">
                  <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                    Legal Pleadings &amp; Exhibits ({filteredDocs.length})
                  </span>
                  <div className="flex items-center gap-1">
                    {(["all", "pdf", "docx"] as FormatFilter[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormatFilter(f)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase transition-colors cursor-pointer ${
                          formatFilter === f
                            ? "bg-primary text-white"
                            : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-outline-variant/20">
                  {docsLoading ? (
                    <div className="p-8 text-center text-xs text-on-surface-variant">Loading pleadings vault...</div>
                  ) : filteredDocs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-on-surface-variant">
                      No pleadings found in this scope. Click &quot;Upload Pleading&quot; to index PDFs or DOCX files.
                    </div>
                  ) : (
                    filteredDocs.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`py-3 px-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          selectedDocId === doc.id
                            ? "bg-surface-container-low border border-primary/20"
                            : "hover:bg-surface-container-low"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="material-symbols-outlined text-primary text-[20px] shrink-0">
                            description
                          </span>
                          <div className="space-y-0.5 min-w-0">
                            <span className="text-xs font-semibold text-on-surface truncate block">
                              {doc.title}
                            </span>
                            <span className="text-[11px] text-outline block">
                              {doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : "Indexed"} · Status: {doc.status}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/documents/${doc.id}`);
                            }}
                            className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-[11px] font-medium text-primary flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>Examine</span>
                            <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDoc(doc.id);
                            }}
                            className="text-outline hover:text-error p-1 cursor-pointer"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Pleading Inspector (4 Cols) */}
            <div className="lg:col-span-4 space-y-space-md">
              {selectedDoc ? (
                <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
                  <div className="border-b border-outline-variant/20 pb-space-sm space-y-1">
                    <span className="text-[10px] font-mono-sm uppercase text-outline">
                      Pleading Metadata
                    </span>
                    <h3 className="font-headline text-headline-sm text-on-surface truncate">
                      {selectedDoc.title}
                    </h3>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-outline-variant/10">
                      <span className="text-outline">File Status</span>
                      <span className="font-medium text-emerald-600">{selectedDoc.status}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-outline-variant/10">
                      <span className="text-outline">Storage</span>
                      <span className="font-medium text-on-surface">Local Encrypted Disk</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-outline-variant/10">
                      <span className="text-outline">File Size</span>
                      <span className="font-medium text-on-surface">
                        {selectedDoc.file_size ? `${Math.round(selectedDoc.file_size / 1024)} KB` : "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/documents/${selectedDoc.id}`)}
                      className="w-full py-2 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      <span>Examine Chunks &amp; Prep Precedents</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/chat?doc_id=${selectedDoc.id}`)}
                      className="w-full py-2 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-medium text-xs flex items-center justify-center gap-1.5 border border-outline-variant/30 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>Launch Grounded Advisory Inquiry</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                  Select a pleading to view details.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Chamber Rules & Precedents */}
        {activeTab === "cog-mem" && (
          <div className="space-y-space-md">
            {/* Scope Sub-tabs */}
            <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
              <button
                type="button"
                onClick={() => setMemoryScopeTab("global")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  memoryScopeTab === "global"
                    ? "bg-primary text-white"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                Global Chamber Rules
              </button>
              <button
                type="button"
                onClick={() => setMemoryScopeTab("workspace")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  memoryScopeTab === "workspace"
                    ? "bg-primary text-white"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                Matter-Specific Rules ({activeWorkspace?.name || "Active Docket"})
              </button>
            </div>

            {/* Persona Editor for Matter Scope */}
            {memoryScopeTab === "workspace" && (
              <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-amber-600">psychology</span>
                    <span>Matter AI Research Persona &amp; Statutory Guidelines</span>
                  </span>
                  {personaSuccessMsg && (
                    <span className="text-xs text-emerald-600 font-medium">{personaSuccessMsg}</span>
                  )}
                </div>
                <p className="text-[11px] text-outline">
                  Configure procedural directions, binding court bench rules, and evidentiary standards injected into this matter&apos;s AI queries.
                </p>
                <div className="flex gap-2">
                  <textarea
                    value={personaInstructions}
                    onChange={(e) => setPersonaInstructions(e.target.value)}
                    placeholder="e.g. Act as Senior Counsel. Cite relevant Supreme Court and High Court precedents. Verify limitation timelines under Limitation Act 1963 and Order VIII Rule 1 CPC commercial deadlines."
                    rows={2}
                    className="w-full p-2.5 text-xs rounded-lg border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-colors resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleSavePersona}
                    disabled={isSavingPersona}
                    className="px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-xs font-medium text-on-surface border border-outline-variant/30 shrink-0 self-end transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSavingPersona ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* Rules List & Review Queue */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-space-sm">
                <div className="flex items-center gap-2">
                  <span className="font-headline text-headline-sm text-on-surface">
                    Chamber Rules &amp; Legal Principles ({filteredMemories.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddMemModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">add</span>
                    <span>+ Add Legal Rule</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-outline-variant/20">
                {memsLoading ? (
                  <div className="p-8 text-center text-xs text-on-surface-variant">Loading legal rules...</div>
                ) : filteredMemories.length === 0 ? (
                  <div className="p-8 text-center text-xs text-on-surface-variant">
                    No rules registered in this scope. Click &quot;+ Add Legal Rule&quot; to teach the Advisory Copilot custom chamber preferences.
                  </div>
                ) : (
                  filteredMemories.map((mem) => (
                    <div
                      key={mem.id}
                      className="py-3 px-2 rounded-lg flex items-start justify-between gap-3 hover:bg-surface-container-low transition-colors"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 rounded font-mono-sm text-[9px] uppercase bg-surface-container-high text-on-surface-variant">
                            {mem.category}
                          </span>
                          {mem.review_status === "pending" && (
                            <span className="px-1.5 py-0.2 rounded font-mono-sm text-[9px] bg-amber-500/10 text-amber-600 border border-amber-500/30">
                              Requires Review
                            </span>
                          )}
                          {mem.review_status === "approved" && (
                            <span className="px-1.5 py-0.2 rounded font-mono-sm text-[9px] bg-emerald-500/10 text-emerald-600">
                              Active Rule
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface font-medium leading-relaxed">
                          {mem.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pt-1">
                        {mem.review_status === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveMem(mem.id)}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectMem(mem.id)}
                              className="px-2 py-0.5 rounded bg-surface-container-high hover:bg-error/20 text-error text-[10px] font-medium cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteMem(mem.id)}
                          className="text-outline hover:text-error p-1 cursor-pointer"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Memory Modal */}
        {showAddMemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/40 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <h3 className="font-headline text-headline-sm text-on-surface">
                  Add Legal Rule / Precedent Note
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddMemModal(false)}
                  className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleAddMemory} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Legal Principle / Chamber Rule
                  </label>
                  <textarea
                    value={newMemContent}
                    onChange={(e) => setNewMemContent(e.target.value)}
                    placeholder="e.g. Always verify Section 12A Commercial Courts Act pre-institution mediation status before calculating plaint limitation."
                    rows={3}
                    required
                    className="w-full p-2.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Rule Category
                  </label>
                  <select
                    value={newMemCategory}
                    onChange={(e) => setNewMemCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low text-on-surface"
                  >
                    <option value="instruction">Procedural Instruction</option>
                    <option value="fact">Binding Precedent Note</option>
                    <option value="preference">Drafting Style Preference</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddMemModal(false)}
                    className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs"
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
