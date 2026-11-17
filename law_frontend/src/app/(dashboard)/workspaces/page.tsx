"use client";

import { useState, useRef, useEffect, DragEvent, ChangeEvent, useMemo } from "react";
import { api } from "@/lib/api";

type ResourceType = "document" | "chat" | "goal" | "task" | "memory";
type FilterType = "all" | ResourceType;

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  custom_instructions?: string | null;
  owner_id: string;
  member_count: number;
  resource_count: number;
  role: "owner" | "admin" | "editor" | "viewer" | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WorkspaceResource {
  id: string;
  workspace_id: string;
  resource_type: ResourceType;
  resource_id: string;
  title: string;
  subtitle: string | null;
  added_by_id: string;
  created_at: string;
}

interface AvailableResource {
  resource_type: ResourceType;
  resource_id: string;
  title: string;
  subtitle: string | null;
}

export default function CaseMattersPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [resources, setResources] = useState<WorkspaceResource[]>([]);
  const [availableResources, setAvailableResources] = useState<AvailableResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResourcesLoading, setIsResourcesLoading] = useState(false);

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [newWsCustomInstructions, setNewWsCustomInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Custom Instructions & Persona State
  const [editInstructions, setEditInstructions] = useState("");
  const [isUpdatingInstructions, setIsUpdatingInstructions] = useState(false);
  const [instructionsNotice, setInstructionsNotice] = useState<string | null>(null);

  // Item Picker Modal
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<FilterType>("all");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedResourceKeys, setSelectedResourceKeys] = useState<Set<string>>(new Set());
  const [isSavingSelection, setIsSavingSelection] = useState(false);

  // Resource Filter on Main Page
  const [resourceFilter, setResourceFilter] = useState<FilterType>("all");
  const [resourceSearch, setResourceSearch] = useState("");

  // Export & Import states
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PDF Generator Modal states
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfSubtitle, setPdfSubtitle] = useState("");
  const [pdfMode, setPdfMode] = useState<"verbatim" | "summary">("summary");
  const [pdfCustomPrompt, setPdfCustomPrompt] = useState("");
  const [pdfPromptPreset, setPdfPromptPreset] = useState("case_briefing");
  const [pdfSelectedIds, setPdfSelectedIds] = useState<Set<string>>(new Set());
  const [pdfFilter, setPdfFilter] = useState<FilterType>("all");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load Workspaces from Backend
  const loadWorkspaces = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<Workspace[]>("/workspaces");
      if (Array.isArray(data)) {
        setWorkspaces(data);
        if (data.length > 0) {
          const active = data.find((w) => w.is_active) || data[0];
          setSelectedWorkspaceId((prev) => (prev && data.some((w) => w.id === prev) ? prev : active.id));
        } else {
          try {
            const defaultWs = await api.post<Workspace>("/workspaces", {
              name: "Apex Logistics v. Union of India",
              description: "Commercial writ petition and tender challenge matter enclave before the High Court of Delhi.",
              custom_instructions: "Act as Senior Counsel & Legal Research Analyst. Adhere strictly to Limitation Act, Commercial Courts Act, and cite binding Supreme Court precedents.",
            });
            setWorkspaces([defaultWs]);
            setSelectedWorkspaceId(defaultWs.id);
          } catch {
            // Ignore
          }
        }
      }
    } catch (err) {
      console.error("Failed to load case matters:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load Resources for Selected Workspace
  const loadWorkspaceResources = async (wsId: string) => {
    try {
      setIsResourcesLoading(true);
      const res = await api.get<WorkspaceResource[]>(`/workspaces/${wsId}/resources`);
      setResources(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error("Failed to load case matter resources:", err);
      setResources([]);
    } finally {
      setIsResourcesLoading(false);
    }
  };

  // Load Shareable Resources for Picker
  const loadShareableResources = async (wsId: string) => {
    try {
      const data = await api.get<AvailableResource[]>(`/workspaces/${wsId}/shareable-resources`);
      setAvailableResources(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load shareable legal resources:", err);
      setAvailableResources([]);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) || null;

  useEffect(() => {
    if (selectedWorkspaceId) {
      loadWorkspaceResources(selectedWorkspaceId);
      if (selectedWorkspace) {
        setEditInstructions(selectedWorkspace.custom_instructions || "");
      }
    }
  }, [selectedWorkspaceId, selectedWorkspace?.custom_instructions]);

  // Activate Workspace
  const handleSetActive = async (wsId: string) => {
    try {
      await api.put("/workspaces/active", { workspace_id: wsId });
      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          is_active: w.id === wsId,
        }))
      );
      showToast("Active case matter switched successfully.");
    } catch (err) {
      console.error("Failed to set active case matter:", err);
      showToast("Error updating active case matter.");
    }
  };

  // Create Workspace
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setIsCreating(true);
    try {
      const created = await api.post<Workspace>("/workspaces", {
        name: newWsName.trim(),
        description: newWsDesc.trim() || null,
        custom_instructions: newWsCustomInstructions.trim() || null,
      });
      setWorkspaces((prev) => [created, ...prev]);
      setSelectedWorkspaceId(created.id);
      setShowCreateModal(false);
      setNewWsName("");
      setNewWsDesc("");
      setNewWsCustomInstructions("");
      showToast("New case matter created.");
    } catch (err) {
      console.error("Failed to create case matter:", err);
      showToast("Error creating case matter.");
    } finally {
      setIsCreating(false);
    }
  };

  // Save Custom Instructions
  const handleSaveInstructions = async () => {
    if (!selectedWorkspaceId) return;
    setIsUpdatingInstructions(true);
    try {
      await api.put(`/workspaces/${selectedWorkspaceId}`, {
        custom_instructions: editInstructions.trim() || null,
      });
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === selectedWorkspaceId ? { ...w, custom_instructions: editInstructions.trim() || null } : w))
      );
      setInstructionsNotice("Advocate custom guidelines updated.");
      setTimeout(() => setInstructionsNotice(null), 3000);
    } catch (err) {
      console.error("Failed to update instructions:", err);
      setInstructionsNotice("Error saving chamber guidelines.");
      setTimeout(() => setInstructionsNotice(null), 3000);
    } finally {
      setIsUpdatingInstructions(false);
    }
  };

  // Delete Workspace
  const handleDeleteWorkspace = async (wsId: string) => {
    if (!confirm("Are you sure you want to delete this case matter enclave?")) return;
    try {
      await api.delete(`/workspaces/${wsId}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== wsId));
      if (selectedWorkspaceId === wsId) {
        const remaining = workspaces.filter((w) => w.id !== wsId);
        setSelectedWorkspaceId(remaining.length > 0 ? remaining[0].id : null);
      }
      showToast("Case matter removed.");
    } catch (err) {
      console.error("Failed to delete case matter:", err);
      showToast("Error deleting case matter.");
    }
  };

  // Open Resource Picker
  const handleOpenPicker = async () => {
    if (!selectedWorkspaceId) return;
    await loadShareableResources(selectedWorkspaceId);
    const existingKeys = new Set(resources.map((r) => `${r.resource_type}:${r.resource_id}`));
    setSelectedResourceKeys(existingKeys);
    setShowPickerModal(true);
  };

  // Save Picked Resources
  const handleSavePickedResources = async () => {
    if (!selectedWorkspaceId) return;
    setIsSavingSelection(true);
    try {
      const itemsToAttach: { resource_type: ResourceType; resource_id: string }[] = [];
      const currentKeys = new Set(resources.map((r) => `${r.resource_type}:${r.resource_id}`));

      selectedResourceKeys.forEach((key) => {
        if (!currentKeys.has(key)) {
          const [rtype, rid] = key.split(":") as [ResourceType, string];
          itemsToAttach.push({ resource_type: rtype, resource_id: rid });
        }
      });

      const keysToRemove: { resource_type: ResourceType; resource_id: string }[] = [];
      resources.forEach((r) => {
        const key = `${r.resource_type}:${r.resource_id}`;
        if (!selectedResourceKeys.has(key)) {
          keysToRemove.push({ resource_type: r.resource_type, resource_id: r.resource_id });
        }
      });

      if (itemsToAttach.length > 0) {
        await api.post(`/workspaces/${selectedWorkspaceId}/resources/batch`, {
          resources: itemsToAttach,
        });
      }
      if (keysToRemove.length > 0) {
        await api.post(`/workspaces/${selectedWorkspaceId}/resources/batch-remove`, {
          resources: keysToRemove,
        });
      }

      await loadWorkspaceResources(selectedWorkspaceId);
      setShowPickerModal(false);
      showToast("Case matter dockets synchronized.");
    } catch (err) {
      console.error("Failed to update resources:", err);
      showToast("Failed to update dockets.");
    } finally {
      setIsSavingSelection(false);
    }
  };

  // Detach single item
  const handleRemoveSingleResource = async (resourceId: string) => {
    if (!selectedWorkspaceId) return;
    try {
      await api.delete(`/workspaces/${selectedWorkspaceId}/resources/${resourceId}`);
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
      showToast("Item detached from case matter.");
    } catch (err) {
      console.error("Failed to detach item:", err);
    }
  };

  // Export Bundle
  const handleExport = async () => {
    if (!selectedWorkspaceId) return;
    setIsExporting(true);
    setExportNotice("Compiling portable air-gapped litigation archive...");
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:19000/api";
      const token = document.cookie.match(/(?:^|; )loopback_csrf_token=([^;]*)/)?.[1];
      const res = await fetch(`${baseUrl}/workspaces/${selectedWorkspaceId}/export`, {
        headers: token ? { "X-CSRF-Token": decodeURIComponent(token) } : {},
      });
      if (!res.ok) throw new Error("Export request failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedWorkspace?.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "case_matter"}.loopback.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportNotice("Litigation bundle downloaded.");
      setTimeout(() => setExportNotice(null), 3500);
    } catch {
      setExportNotice("Failed to export case matter archive.");
      setTimeout(() => setExportNotice(null), 3500);
    } finally {
      setIsExporting(false);
    }
  };

  // Import Bundle
  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) processImportFile(files[0]);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) processImportFile(files[0]);
  };

  const processImportFile = async (file: File) => {
    if (!file.name.endsWith(".zip") && !file.name.endsWith(".loopback.zip")) {
      showToast("File must be a .loopback.zip archive");
      return;
    }
    setImportStatus("Unpacking and reconstructing case matter...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.upload("/workspaces/import", formData);
      setImportStatus("Case matter restored successfully.");
      await loadWorkspaces();
      setTimeout(() => setImportStatus(null), 3000);
    } catch {
      setImportStatus("Import failed. Verify archive format.");
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  // Open PDF Dossier Modal
  const handleOpenPdfModal = () => {
    if (!selectedWorkspace) return;
    setPdfTitle(`${selectedWorkspace.name} Litigation Dossier`);
    setPdfSubtitle(`Legal Briefing & Case Law Synthesis · High Court of Delhi`);
    setPdfPromptPreset("case_briefing");
    setPdfCustomPrompt(
      "Synthesize a comprehensive litigation dossier analyzing factual matrix, statutory provisions, binding Supreme Court precedents, and key prayers for oral arguments."
    );
    const allIds = new Set(resources.map((r) => r.id));
    setPdfSelectedIds(allIds);
    setShowPdfModal(true);
  };

  // Generate PDF Dossier
  const handleGeneratePdf = async () => {
    if (!selectedWorkspaceId) return;
    setIsGeneratingPdf(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:19000/api";
      const token = document.cookie.match(/(?:^|; )loopback_csrf_token=([^;]*)/)?.[1];
      const payload = {
        title: pdfTitle || "Case Law Briefing & Litigation Dossier",
        subtitle: pdfSubtitle || null,
        mode: pdfMode,
        custom_prompt: pdfMode === "summary" ? pdfCustomPrompt : null,
        resource_ids: Array.from(pdfSelectedIds),
      };

      const res = await fetch(`${baseUrl}/workspaces/${selectedWorkspaceId}/generate-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-CSRF-Token": decodeURIComponent(token) } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfTitle.replace(/[^a-zA-Z0-9_-]/g, "_") || "litigation_dossier"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowPdfModal(false);
      showToast("PDF Litigation Dossier downloaded.");
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      showToast("PDF generation failed. Check server logs.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Filtered resources on main view
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchesType = resourceFilter === "all" || r.resource_type === resourceFilter;
      const matchesSearch =
        !resourceSearch.trim() ||
        r.title.toLowerCase().includes(resourceSearch.toLowerCase()) ||
        (r.subtitle && r.subtitle.toLowerCase().includes(resourceSearch.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [resources, resourceFilter, resourceSearch]);

  const getResourceIcon = (type: ResourceType) => {
    switch (type) {
      case "document":
        return "description";
      case "chat":
        return "chat";
      case "task":
        return "check_box";
      case "goal":
        return "flag";
      case "memory":
        return "psychology";
      default:
        return "folder";
    }
  };

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-on-surface text-surface px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">folder_copy</span>
              <h1 className="font-headline text-headline-md text-on-surface">
                Case Matters &amp; Litigation Dockets
              </h1>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Air-gapped matter enclaves for active litigation files, client briefs, court hearings, and scoped RAG precedent retrieval.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>+ New Case Matter</span>
            </button>
          </div>
        </div>

        {/* Main Grid: Case Matter List vs Active Matter Details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Left Column: Matter Cards (4 Cols) */}
          <div className="lg:col-span-4 space-y-space-md">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Active Dockets ({workspaces.length})
              </span>
              <span className="text-[11px] text-outline">Click to inspect</span>
            </div>

            <div className="space-y-2">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-on-surface-variant">Loading dockets...</div>
              ) : workspaces.length === 0 ? (
                <div className="p-8 text-center text-xs text-on-surface-variant border border-dashed rounded-lg">
                  No case matters found.
                </div>
              ) : (
                workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    onClick={() => setSelectedWorkspaceId(ws.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      selectedWorkspaceId === ws.id
                        ? "bg-surface-container-low border-primary/40 shadow-xs"
                        : "bg-surface-container-lowest border-outline-variant/30 hover:bg-surface-container-low"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-headline-sm text-sm text-on-surface font-semibold truncate">
                            {ws.name}
                          </span>
                          {ws.is_active && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-medium border border-emerald-500/30">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant line-clamp-2">
                          {ws.description || "No description provided."}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorkspace(ws.id);
                        }}
                        className="text-on-surface-variant/40 hover:text-error p-1 transition-colors cursor-pointer"
                        title="Delete matter"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-outline">
                      <span>{ws.resource_count || 0} attached items</span>
                      {!ws.is_active && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetActive(ws.id);
                          }}
                          className="text-primary hover:underline font-medium cursor-pointer"
                        >
                          Set Active →
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Offline Import Section */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              className={`p-4 rounded-xl border-2 border-dashed transition-all text-center space-y-2 cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-outline-variant/40 bg-surface-container-lowest hover:border-outline"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                className="hidden"
                accept=".zip"
              />
              <span className="material-symbols-outlined text-[24px] text-primary">cloud_upload</span>
              <div className="text-xs font-medium text-on-surface">Import .loopback.zip Bundle</div>
              <p className="text-[11px] text-outline">
                Drag and drop or browse archive to reconstruct complete case matter offline
              </p>
              {importStatus && <div className="text-xs text-primary font-medium">{importStatus}</div>}
            </div>
          </div>

          {/* Right Column: Case Matter Inspector & Attached Files (8 Cols) */}
          <div className="lg:col-span-8 space-y-space-md">
            {selectedWorkspace ? (
              <>
                {/* Matter Header Banner */}
                <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-space-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary-container"></span>
                        <h2 className="font-headline text-headline-sm text-on-surface">
                          {selectedWorkspace.name}
                        </h2>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        {selectedWorkspace.description || "Active legal proceeding enclave."}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleOpenPdfModal}
                        className="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs border border-outline-variant/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Generate styled PDF litigation dossier"
                      >
                        <span className="material-symbols-outlined text-[15px] text-primary">picture_as_pdf</span>
                        <span>Generate Dossier</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExport}
                        disabled={isExporting}
                        className="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs border border-outline-variant/30 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Export complete air-gapped .zip package"
                      >
                        <span className="material-symbols-outlined text-[15px]">download</span>
                        <span>Export Zip</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenPicker}
                        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">library_add</span>
                        <span>Attach Dockets</span>
                      </button>
                    </div>
                  </div>

                  {exportNotice && (
                    <div className="p-2 rounded bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                      {exportNotice}
                    </div>
                  )}

                  {/* Chamber Guidelines & AI Persona Editor */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-amber-600">psychology</span>
                        <span>Chamber Guidelines &amp; AI Research Persona</span>
                      </span>
                      {instructionsNotice && (
                        <span className="text-xs text-emerald-600 font-medium">{instructionsNotice}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-outline">
                      Direct the Advisory Copilot on court etiquette, binding precedents to prioritize, and strict procedural rules.
                    </p>
                    <div className="flex gap-2">
                      <textarea
                        value={editInstructions}
                        onChange={(e) => setEditInstructions(e.target.value)}
                        placeholder="e.g. Act as Senior Counsel. Cite relevant Supreme Court of India judgments (SCG Contracts, Vidya Drolia, Puttaswamy). Enforce Commercial Courts Act 120-day limit."
                        rows={2}
                        className="w-full p-2.5 text-xs rounded-lg border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-colors resize-none"
                      />
                      <button
                        type="button"
                        onClick={handleSaveInstructions}
                        disabled={isUpdatingInstructions}
                        className="px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-xs font-medium text-on-surface border border-outline-variant/30 shrink-0 self-end transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isUpdatingInstructions ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Attached Case Items List */}
                <div className="p-space-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-sm border-b border-outline-variant/20">
                    <div className="flex items-center gap-2">
                      <span className="font-headline text-headline-sm text-on-surface">
                        Enclave Materials &amp; Evidence ({filteredResources.length})
                      </span>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(["all", "document", "chat", "task", "goal", "memory"] as FilterType[]).map((ft) => (
                        <button
                          key={ft}
                          type="button"
                          onClick={() => setResourceFilter(ft)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                            resourceFilter === ft
                              ? "bg-primary text-white"
                              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                          }`}
                        >
                          {ft === "all" ? "All Items" : ft === "document" ? "Pleadings" : ft === "task" ? "Hearings" : ft === "goal" ? "Milestones" : ft}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search Bar within items */}
                  <div className="relative">
                    <input
                      type="text"
                      value={resourceSearch}
                      onChange={(e) => setResourceSearch(e.target.value)}
                      placeholder="Search attached pleadings, hearings, or research chats..."
                      className="w-full px-3 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Resource List Items */}
                  <div className="divide-y divide-outline-variant/20">
                    {isResourcesLoading ? (
                      <div className="p-8 text-center text-xs text-on-surface-variant">Loading attached materials...</div>
                    ) : filteredResources.length === 0 ? (
                      <div className="p-8 text-center text-xs text-on-surface-variant">
                        No materials attached in this category. Click &quot;Attach Dockets&quot; above.
                      </div>
                    ) : (
                      filteredResources.map((res) => (
                        <div
                          key={res.id}
                          className="py-3 flex items-center justify-between gap-3 hover:bg-surface-container-low px-2 rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                              {getResourceIcon(res.resource_type)}
                            </span>
                            <div className="space-y-0.5 min-w-0">
                              <div className="text-xs font-medium text-on-surface truncate">{res.title}</div>
                              {res.subtitle && <div className="text-[11px] text-outline truncate">{res.subtitle}</div>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-1.5 py-0.5 rounded uppercase font-mono-sm text-[9px] bg-surface-container-high text-on-surface-variant">
                              {res.resource_type}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSingleResource(res.id)}
                              className="text-outline hover:text-error p-1 transition-colors cursor-pointer"
                              title="Detach from matter"
                            >
                              <span className="material-symbols-outlined text-[15px]">close</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                Select a case matter from the left or create a new docket.
              </div>
            )}
          </div>
        </div>

        {/* Create Case Matter Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/40 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <h3 className="font-headline text-headline-sm text-on-surface">
                  Create New Case Matter
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateWorkspace} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Matter Name / Cause Title *
                  </label>
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="e.g. Zenith Pharma v. Biocure Lifesciences"
                    required
                    className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Procedural Summary / Forum
                  </label>
                  <input
                    type="text"
                    value={newWsDesc}
                    onChange={(e) => setNewWsDesc(e.target.value)}
                    placeholder="e.g. Commercial Suit CS(COMM) 105/2026 - Patent Infringement before Delhi High Court"
                    className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Chamber Research Persona &amp; Rules
                  </label>
                  <textarea
                    value={newWsCustomInstructions}
                    onChange={(e) => setNewWsCustomInstructions(e.target.value)}
                    placeholder="e.g. Focus on patent claim construction, cite landmark IP precedents (Novartis, Cadila), verify Section 12A mediation compliance."
                    rows={3}
                    className="w-full p-2.5 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-1.5 rounded text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isCreating ? "Creating..." : "Create Case Matter"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Item Picker Modal (Attach/Detach) */}
        {showPickerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/40 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <div>
                  <h3 className="font-headline text-headline-sm text-on-surface">
                    Attach Dockets &amp; Evidence
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    Select items to associate with {selectedWorkspace?.name} for scoped AI research
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPickerModal(false)}
                  className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Filter available files, hearings, or research chats..."
                  className="flex-1 px-3 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:outline-none"
                />
                <select
                  value={pickerFilter}
                  onChange={(e) => setPickerFilter(e.target.value as FilterType)}
                  className="px-2.5 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low text-on-surface"
                >
                  <option value="all">All Types</option>
                  <option value="document">Pleadings</option>
                  <option value="chat">Advisory Chats</option>
                  <option value="task">Hearings &amp; Filings</option>
                  <option value="goal">Milestones</option>
                  <option value="memory">Legal Rules</option>
                </select>
              </div>

              {/* Available List */}
              <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/20 pr-1">
                {availableResources.length === 0 ? (
                  <div className="p-8 text-center text-xs text-on-surface-variant">
                    No shareable legal items available.
                  </div>
                ) : (
                  availableResources
                    .filter((r) => {
                      const matchesType = pickerFilter === "all" || r.resource_type === pickerFilter;
                      const matchesSearch =
                        !pickerSearch.trim() ||
                        r.title.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                        (r.subtitle && r.subtitle.toLowerCase().includes(pickerSearch.toLowerCase()));
                      return matchesType && matchesSearch;
                    })
                    .map((item) => {
                      const key = `${item.resource_type}:${item.resource_id}`;
                      const isSelected = selectedResourceKeys.has(key);
                      return (
                        <div
                          key={key}
                          onClick={() => {
                            const next = new Set(selectedResourceKeys);
                            if (isSelected) next.delete(key);
                            else next.add(key);
                            setSelectedResourceKeys(next);
                          }}
                          className={`py-2.5 px-3 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-surface-container-low"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="rounded border-outline text-primary focus:ring-0 cursor-pointer"
                            />
                            <div className="space-y-0.5 min-w-0">
                              <span className="text-xs font-medium text-on-surface truncate block">
                                {item.title}
                              </span>
                              {item.subtitle && (
                                <span className="text-[11px] text-outline truncate block">
                                  {item.subtitle}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="px-1.5 py-0.5 rounded uppercase font-mono-sm text-[9px] bg-surface-container-high text-on-surface-variant shrink-0">
                            {item.resource_type}
                          </span>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
                <span className="text-xs text-on-surface-variant">
                  {selectedResourceKeys.size} items selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPickerModal(false)}
                    className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePickedResources}
                    disabled={isSavingSelection}
                    className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isSavingSelection ? "Saving..." : "Apply Selection"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PDF Litigation Dossier Modal */}
        {showPdfModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-xl bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/40 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">picture_as_pdf</span>
                  <h3 className="font-headline text-headline-sm text-on-surface">
                    Compile Litigation Dossier
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Dossier Title
                  </label>
                  <input
                    type="text"
                    value={pdfTitle}
                    onChange={(e) => setPdfTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Subtitle / Forum Heading
                  </label>
                  <input
                    type="text"
                    value={pdfSubtitle}
                    onChange={(e) => setPdfSubtitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Compilation Mode */}
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">
                    Synthesis Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPdfMode("summary")}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                        pdfMode === "summary"
                          ? "bg-primary/5 border-primary text-primary"
                          : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      <div className="font-semibold text-xs">AI Legal Synthesis</div>
                      <div className="text-[10px] text-outline mt-0.5">
                        Synthesizes facts, claims &amp; precedents into an executive brief
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPdfMode("verbatim")}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                        pdfMode === "verbatim"
                          ? "bg-primary/5 border-primary text-primary"
                          : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      <div className="font-semibold text-xs">Verbatim Record</div>
                      <div className="text-[10px] text-outline mt-0.5">
                        Compiles complete unedited chat logs, tasks, and pleadings tables
                      </div>
                    </button>
                  </div>
                </div>

                {/* Prompt Presets (for summary mode) */}
                {pdfMode === "summary" && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-on-surface">
                      Synthesis Preset &amp; Objective
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: "case_briefing", label: "Case Law Briefing" },
                        { id: "precedent_dossier", label: "Precedent Compendium" },
                        { id: "cross_examination", label: "Cross-Examination Prep" },
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setPdfPromptPreset(preset.id);
                            if (preset.id === "case_briefing") {
                              setPdfCustomPrompt(
                                "Synthesize a comprehensive litigation briefing analyzing factual matrix, statutory provisions, binding Supreme Court precedents, and key prayers for oral arguments."
                              );
                            } else if (preset.id === "precedent_dossier") {
                              setPdfCustomPrompt(
                                "Compile an indexed precedent dossier with ratio decidendi, citations, and distinguishing analysis against respondent claims."
                              );
                            } else if (preset.id === "cross_examination") {
                              setPdfCustomPrompt(
                                "Prepare a strategic cross-examination questionnaire and witness confrontation notes based on extracted evidence and pleadings."
                              );
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                            pdfPromptPreset === preset.id
                              ? "bg-primary text-white"
                              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={pdfCustomPrompt}
                      onChange={(e) => setPdfCustomPrompt(e.target.value)}
                      rows={3}
                      className="w-full p-2 text-xs rounded border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  className="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isGeneratingPdf && (
                    <span className="material-symbols-outlined animate-spin text-[15px]">progress_activity</span>
                  )}
                  <span>{isGeneratingPdf ? "Synthesizing Dossier..." : "Generate PDF Dossier"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
