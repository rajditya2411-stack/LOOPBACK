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

export default function WorkspacesPage() {
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
  const [pdfPromptPreset, setPdfPromptPreset] = useState("study_guide");
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
          // If no workspace exists, auto-create a default workspace
          try {
            const defaultWs = await api.post<Workspace>("/workspaces", {
              name: "Personal Sandbox",
              description: "Default workspace for general coursework and research.",
            });
            setWorkspaces([defaultWs]);
            setSelectedWorkspaceId(defaultWs.id);
          } catch {
            // Ignore
          }
        }
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
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
      console.error("Failed to load workspace resources:", err);
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
      console.error("Failed to load shareable resources:", err);
      setAvailableResources([]);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  useEffect(() => {
    const active = workspaces.find((w) => w.id === selectedWorkspaceId);
    if (active) {
      setEditInstructions(active.custom_instructions || "");
    }
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      loadWorkspaceResources(selectedWorkspaceId);
    } else {
      setResources([]);
    }
  }, [selectedWorkspaceId]);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [workspaces, selectedWorkspaceId]);

  // Switch Active Workspace
  const handleSetActive = async (wsId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.put<Workspace>("/workspaces/active", { workspace_id: wsId });
      setWorkspaces((prev) =>
        prev.map((w) => ({
          ...w,
          is_active: w.id === wsId,
        }))
      );
      setSelectedWorkspaceId(wsId);
      showToast("Active workspace updated");
    } catch (err) {
      console.error("Failed to set active workspace:", err);
    }
  };

  // Create New Workspace
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;

    try {
      setIsCreating(true);
      const newWs = await api.post<Workspace>("/workspaces", {
        name: newWsName.trim(),
        description: newWsDesc.trim() || null,
        custom_instructions: newWsCustomInstructions.trim() || null,
      });
      setWorkspaces((prev) => [newWs, ...prev]);
      setSelectedWorkspaceId(newWs.id);
      setNewWsName("");
      setNewWsDesc("");
      setNewWsCustomInstructions("");
      setShowCreateModal(false);
      showToast(`Created workspace "${newWs.name}"`);

      // Immediately open the item picker to populate the new workspace
      openItemPicker(newWs.id, []);
    } catch (err) {
      console.error("Failed to create workspace:", err);
      showToast("Error creating workspace");
    } finally {
      setIsCreating(false);
    }
  };

  // Update Workspace AI Custom Instructions
  const handleUpdateInstructions = async () => {
    if (!selectedWorkspaceId) return;
    try {
      setIsUpdatingInstructions(true);
      const updated = await api.put<Workspace>(`/workspaces/${selectedWorkspaceId}`, {
        custom_instructions: editInstructions.trim() || null,
      });
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === selectedWorkspaceId ? { ...w, ...updated } : w))
      );
      setInstructionsNotice("Project AI instructions saved!");
      setTimeout(() => setInstructionsNotice(null), 3000);
    } catch (err) {
      console.error("Failed to update instructions:", err);
      showToast("Failed to save instructions");
    } finally {
      setIsUpdatingInstructions(false);
    }
  };

  // Delete Workspace
  const handleDeleteWorkspace = async (wsId: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete workspace "${name}"? Attached personal tasks and files will not be deleted.`)) {
      return;
    }

    try {
      await api.delete(`/workspaces/${wsId}`);
      const updated = workspaces.filter((w) => w.id !== wsId);
      setWorkspaces(updated);
      if (selectedWorkspaceId === wsId) {
        setSelectedWorkspaceId(updated[0]?.id || null);
      }
      showToast(`Deleted workspace "${name}"`);
    } catch (err) {
      console.error("Failed to delete workspace:", err);
      showToast("Failed to delete workspace");
    }
  };

  // Open Item Picker Modal
  const openItemPicker = async (wsId: string, currentRes: WorkspaceResource[] = resources) => {
    await loadShareableResources(wsId);
    const existingKeys = new Set(currentRes.map((r) => `${r.resource_type}:${r.resource_id}`));
    setSelectedResourceKeys(existingKeys);
    setPickerFilter("all");
    setPickerSearch("");
    setShowPickerModal(true);
  };

  // Toggle selection in picker
  const togglePickerItem = (key: string) => {
    setSelectedResourceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Select / Deselect All Visible in Picker
  const handleSelectAllVisible = (visibleItems: AvailableResource[]) => {
    setSelectedResourceKeys((prev) => {
      const next = new Set(prev);
      visibleItems.forEach((item) => next.add(`${item.resource_type}:${item.resource_id}`));
      return next;
    });
  };

  const handleDeselectAllVisible = (visibleItems: AvailableResource[]) => {
    setSelectedResourceKeys((prev) => {
      const next = new Set(prev);
      visibleItems.forEach((item) => next.delete(`${item.resource_type}:${item.resource_id}`));
      return next;
    });
  };

  // Save Picker Selection
  const handleSaveSelection = async () => {
    if (!selectedWorkspaceId) return;

    try {
      setIsSavingSelection(true);
      const existingKeys = new Set(resources.map((r) => `${r.resource_type}:${r.resource_id}`));

      // Determine additions
      const toAdd: { resource_type: ResourceType; resource_id: string }[] = [];
      selectedResourceKeys.forEach((key) => {
        if (!existingKeys.has(key)) {
          const [type, id] = key.split(":");
          toAdd.push({ resource_type: type as ResourceType, resource_id: id });
        }
      });

      // Determine removals
      const toRemove: { resource_type: ResourceType; resource_id: string }[] = [];
      resources.forEach((r) => {
        const key = `${r.resource_type}:${r.resource_id}`;
        if (!selectedResourceKeys.has(key)) {
          toRemove.push({ resource_type: r.resource_type, resource_id: r.resource_id });
        }
      });

      if (toAdd.length > 0) {
        await api.post(`/workspaces/${selectedWorkspaceId}/resources/batch`, { resources: toAdd });
      }
      if (toRemove.length > 0) {
        await api.post(`/workspaces/${selectedWorkspaceId}/resources/batch-remove`, { resources: toRemove });
      }

      await loadWorkspaceResources(selectedWorkspaceId);
      // Update resource count in workspace card
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === selectedWorkspaceId ? { ...w, resource_count: selectedResourceKeys.size } : w
        )
      );

      setShowPickerModal(false);
      showToast(`Updated workspace items (${selectedResourceKeys.size} selected)`);
    } catch (err) {
      console.error("Failed to save selection:", err);
      showToast("Failed to save selection");
    } finally {
      setIsSavingSelection(false);
    }
  };

  // Remove Single Resource from Workspace
  const handleRemoveSingleResource = async (resourceId: string, title: string) => {
    if (!selectedWorkspaceId) return;
    try {
      await api.delete(`/workspaces/${selectedWorkspaceId}/resources/${resourceId}`);
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === selectedWorkspaceId ? { ...w, resource_count: Math.max(0, w.resource_count - 1) } : w
        )
      );
      showToast(`Removed "${title}" from workspace`);
    } catch (err) {
      console.error("Failed to remove resource:", err);
      showToast("Failed to remove resource");
    }
  };

  // Export Workspace to Portable .zip
  const handleExportZip = async () => {
    if (!selectedWorkspace) return;
    setIsExporting(true);
    setExportNotice("Packaging workspace items & chat transcripts...");

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:19000/api";
      const response = await fetch(`${baseUrl}/workspaces/${selectedWorkspace.id}/export`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/zip" },
      });

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = selectedWorkspace.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      a.download = `${safeName}.loopback.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportNotice(`Exported ${safeName}.loopback.zip successfully!`);
      showToast(`Exported "${selectedWorkspace.name}" package`);
    } catch (err) {
      console.error("Export error:", err);
      setExportNotice("Export failed. Please ensure backend is running.");
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportNotice(null), 4000);
    }
  };

  // Open PDF Generator Modal
  const openPdfModal = () => {
    if (!selectedWorkspace) return;
    setPdfTitle(`${selectedWorkspace.name} Dossier`);
    setPdfSubtitle(`Academic Briefing • ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
    setPdfMode("summary");
    setPdfCustomPrompt("Create an exam-ready study guide synthesizing key concepts, formula derivations, and next steps.");
    setPdfPromptPreset("study_guide");
    setPdfSelectedIds(new Set(resources.map((r) => r.resource_id)));
    setPdfFilter("all");
    setShowPdfModal(true);
  };

  const handleSelectAllPdf = () => {
    setPdfSelectedIds(new Set(resources.map((r) => r.resource_id)));
  };

  const handleDeselectAllPdf = () => {
    setPdfSelectedIds(new Set());
  };

  const togglePdfItem = (resourceId: string) => {
    setPdfSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  };

  const handleApplyPreset = (preset: string) => {
    setPdfPromptPreset(preset);
    if (preset === "study_guide") {
      setPdfCustomPrompt("Create an exam-ready study guide synthesizing key concepts, formula derivations, and next steps.");
    } else if (preset === "executive_brief") {
      setPdfCustomPrompt("Generate an executive briefing summarizing all project milestones, task deadlines, and progress.");
    } else if (preset === "qa_review") {
      setPdfCustomPrompt("Synthesize key questions and answers from the chat consultations with actionable takeaways.");
    }
  };

  const handleGeneratePdf = async () => {
    if (!selectedWorkspace) return;
    if (pdfSelectedIds.size === 0) {
      showToast("Please select at least one item to include in the PDF");
      return;
    }

    try {
      setIsGeneratingPdf(true);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:19000/api";
      const payload = {
        title: pdfTitle.trim() || `${selectedWorkspace.name} Dossier`,
        subtitle: pdfSubtitle.trim() || undefined,
        mode: pdfMode,
        custom_prompt: pdfMode === "summary" ? pdfCustomPrompt.trim() || undefined : undefined,
        resource_ids: Array.from(pdfSelectedIds),
      };

      const response = await fetch(`${baseUrl}/workspaces/${selectedWorkspace.id}/generate-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `PDF generation failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (pdfTitle.trim() || selectedWorkspace.name).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      a.download = `${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowPdfModal(false);
      showToast(`Downloaded "${safeName}.pdf"`);
    } catch (err: unknown) {
      console.error("PDF generation error:", err);
      const msg = err instanceof Error ? err.message : "Failed to generate PDF";
      showToast(msg);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Import / Restore Archive File
  const processImportFile = async (file: File) => {
    setImportStatus(`Unpacking & verifying archive: ${file.name}...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const importedWs = await api.upload<Workspace>("/workspaces/import", formData);
      await loadWorkspaces();
      setSelectedWorkspaceId(importedWs.id);
      setImportStatus(`Successfully restored workspace "${importedWs.name}"!`);
      showToast(`Imported "${importedWs.name}"`);
    } catch (err) {
      console.error("Import error:", err);
      setImportStatus("Import failed: Ensure the file is a valid .loopback.zip archive.");
    } finally {
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImportFile(file);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImportFile(file);
    }
  };

  // Resource Counts Breakdown for Selected Workspace
  const counts = useMemo(() => {
    const res = { document: 0, chat: 0, goal: 0, task: 0, memory: 0 };
    resources.forEach((r) => {
      if (res[r.resource_type] !== undefined) res[r.resource_type]++;
    });
    return res;
  }, [resources]);

  // Filtered Resources List for Right Column
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

  // Filtered Available Items for Modal Picker
  const filteredAvailable = useMemo(() => {
    return availableResources.filter((item) => {
      const matchesType = pickerFilter === "all" || item.resource_type === pickerFilter;
      const matchesSearch =
        !pickerSearch.trim() ||
        item.title.toLowerCase().includes(pickerSearch.toLowerCase()) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(pickerSearch.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [availableResources, pickerFilter, pickerSearch]);

  // Filtered Resources for PDF Generator Checklist
  const filteredPdfResources = useMemo(() => {
    return resources.filter((r) => {
      return pdfFilter === "all" || r.resource_type === pdfFilter;
    });
  }, [resources, pdfFilter]);

  const getResourceIcon = (type: ResourceType) => {
    switch (type) {
      case "document":
        return "description";
      case "chat":
        return "forum";
      case "goal":
        return "flag";
      case "task":
        return "check_circle";
      case "memory":
        return "psychology";
      default:
        return "folder";
    }
  };

  const getResourceBadge = (type: ResourceType) => {
    switch (type) {
      case "document":
        return "bg-sky-100 text-sky-800 border-sky-200";
      case "chat":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "goal":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "task":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "memory":
        return "bg-purple-100 text-purple-800 border-purple-200";
    }
  };

  return (
    <div className="w-full px-space-lg py-space-lg">
      <div className="flex flex-col w-full max-w-[1240px] mx-auto pb-space-xl gap-space-lg">
        {/* Toast Banner */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-on-surface text-surface font-label-md text-label-md shadow-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top Header Strip */}
        <section className="flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/20">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-outline px-1.5 py-0.5 rounded bg-surface-container">
                Workspace Hub
              </span>
              <span className="font-mono-sm text-mono-sm text-primary bg-primary-fixed px-1.5 py-0.5 rounded font-medium">
                Pure Context Packages
              </span>
              <span className="font-mono-sm text-mono-sm text-secondary bg-surface-container px-1.5 py-0.5 rounded">
                Self-Contained .zip
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              Workspaces &amp; Knowledge Bundles
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Organize your courses into isolated workspaces. Select specific documents, chats, milestones, and tasks to package into a clean portable archive for colleagues.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>New Workspace</span>
            </button>
          </div>
        </section>

        {/* Two-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
          {/* LEFT COLUMN: Workspaces List (5 cols) */}
          <section className="lg:col-span-5 flex flex-col gap-space-md">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-outline">
                <span className="material-symbols-outlined text-[16px]">folder_copy</span>
                <span className="font-mono-sm text-mono-sm uppercase tracking-wider font-semibold">
                  Workspaces ({workspaces.length})
                </span>
              </div>
              <span className="font-mono-sm text-mono-sm text-secondary">
                {workspaces.filter((w) => w.is_active).length} Active
              </span>
            </div>

            {isLoading ? (
              <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/20 text-secondary font-mono-sm text-mono-sm">
                Loading workspaces...
              </div>
            ) : workspaces.length === 0 ? (
              <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/20 flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-[32px] text-outline">folder_off</span>
                <p className="font-body-md text-body-md text-on-surface">No workspaces found.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm"
                >
                  Create Your First Workspace
                </button>
              </div>
            ) : (
              workspaces.map((ws) => {
                const isSelected = ws.id === selectedWorkspaceId;
                return (
                  <article
                    key={ws.id}
                    onClick={() => setSelectedWorkspaceId(ws.id)}
                    className={`p-space-md rounded-xl transition-all cursor-pointer flex flex-col gap-space-sm border relative ${
                      isSelected
                        ? "bg-surface-container-lowest border-primary shadow-sm"
                        : "bg-surface-container-lowest/80 border-outline-variant/25 hover:border-outline-variant/60"
                    }`}
                  >
                    {ws.is_active && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 rounded-t-xl"></div>
                    )}

                    <div className="flex items-start justify-between gap-2 pt-0.5">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ws.is_active ? (
                            <span className="flex items-center gap-1 font-mono-sm text-[11px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Active Workspace
                            </span>
                          ) : (
                            <span className="font-mono-sm text-[11px] text-outline">
                              Inactive
                            </span>
                          )}
                          <span className="font-mono-sm text-[11px] text-secondary bg-surface-container px-1 rounded">
                            {ws.role || "member"}
                          </span>
                        </div>
                        <h2 className="font-headline-sm text-headline-sm text-on-surface truncate mt-1">
                          {ws.name}
                        </h2>
                        {ws.description && (
                          <p className="font-body-sm text-body-sm text-secondary truncate mt-0.5">
                            {ws.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!ws.is_active && (
                          <button
                            onClick={(e) => handleSetActive(ws.id, e)}
                            className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors"
                            title="Set as active workspace"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteWorkspace(ws.id, ws.name, e)}
                          className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors"
                          title="Delete workspace"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 font-mono-sm text-mono-sm text-outline">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                        <span className="text-on-surface font-medium">{ws.resource_count || 0}</span>
                        <span>items attached</span>
                      </div>
                      <span className="text-[11px]">
                        Created {new Date(ws.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </article>
                );
              })
            )}

            {/* Offline Import Dropzone Card */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-space-md rounded-xl border border-dashed transition-all flex flex-col items-center justify-center gap-2 cursor-pointer text-center ${
                isDragging
                  ? "bg-primary-fixed/30 border-primary"
                  : "bg-surface-container-lowest border-outline-variant/40 hover:border-primary/50"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".zip"
                className="hidden"
              />
              <span className="material-symbols-outlined text-[28px] text-primary">
                folder_zip
              </span>
              <div className="flex flex-col">
                <span className="font-label-md text-label-md font-semibold text-on-surface">
                  Restore Workspace from .zip
                </span>
                <span className="font-body-sm text-body-sm text-secondary">
                  Drag &amp; drop a colleague&apos;s .loopback.zip bundle here to unpack
                </span>
              </div>
              {importStatus && (
                <div className="mt-1 px-3 py-1 rounded bg-primary/10 border border-primary/20 font-mono-sm text-mono-sm text-primary">
                  {importStatus}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN: Active Context Inspector & Resource Manager (7 cols) */}
          <section className="lg:col-span-7 flex flex-col gap-space-md">
            {selectedWorkspace ? (
              <>
                {/* Workspace Header & Action Card */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-outline-variant/20 flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-sm border-b border-outline-variant/15">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-sm text-mono-sm uppercase text-outline">
                          Inspecting Scope:
                        </span>
                        <span className="font-label-md text-label-md font-semibold text-on-surface truncate">
                          {selectedWorkspace.name}
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-secondary truncate mt-0.5">
                        {selectedWorkspace.description || "No description provided."}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openItemPicker(selectedWorkspace.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors cursor-pointer"
                        title="Select specific items for this workspace"
                      >
                        <span className="material-symbols-outlined text-[16px] text-primary">checklist</span>
                        <span>Select Items</span>
                      </button>

                      <button
                        onClick={openPdfModal}
                        disabled={resources.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors border border-outline-variant/30 cursor-pointer disabled:opacity-50"
                        title={resources.length === 0 ? "Attach items first to generate a PDF" : "Generate on-demand PDF report or AI synthesis"}
                      >
                        <span className="material-symbols-outlined text-[16px] text-purple-600">picture_as_pdf</span>
                        <span>Generate PDF</span>
                      </button>

                      <button
                        onClick={handleExportZip}
                        disabled={isExporting}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                        title="Download structured zip archive"
                      >
                        <span className={`material-symbols-outlined text-[16px] ${isExporting ? "animate-spin" : ""}`}>
                          {isExporting ? "refresh" : "file_download"}
                        </span>
                        <span>{isExporting ? "Packaging..." : "Export .zip"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Resource Counts Summary Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div className="p-2 rounded-lg bg-surface-container-low flex flex-col items-center text-center">
                      <span className="font-mono-sm text-mono-sm text-outline">Docs</span>
                      <span className="font-mono-md text-mono-md font-semibold text-on-surface mt-0.5">
                        {counts.document}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-low flex flex-col items-center text-center">
                      <span className="font-mono-sm text-mono-sm text-outline">Chats</span>
                      <span className="font-mono-md text-mono-md font-semibold text-on-surface mt-0.5">
                        {counts.chat}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-low flex flex-col items-center text-center">
                      <span className="font-mono-sm text-mono-sm text-outline">Milestones</span>
                      <span className="font-mono-md text-mono-md font-semibold text-on-surface mt-0.5">
                        {counts.goal}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-low flex flex-col items-center text-center">
                      <span className="font-mono-sm text-mono-sm text-outline">Tasks</span>
                      <span className="font-mono-md text-mono-md font-semibold text-on-surface mt-0.5">
                        {counts.task}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-container-low flex flex-col items-center text-center">
                      <span className="font-mono-sm text-mono-sm text-outline">Memories</span>
                      <span className="font-mono-md text-mono-md font-semibold text-on-surface mt-0.5">
                        {counts.memory}
                      </span>
                    </div>
                  </div>

                  {/* Project Persona & AI Instructions Card */}
                  <div className="p-space-sm bg-surface-container-low rounded-lg border border-outline-variant/20 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[17px] text-primary">psychology</span>
                        <span className="font-label-md text-label-md font-semibold text-on-surface">
                          Project AI Instructions (Gem / Custom GPT Persona)
                        </span>
                      </div>
                      {instructionsNotice && (
                        <span className="font-mono-sm text-mono-sm text-emerald-600 font-medium">
                          ✓ {instructionsNotice}
                        </span>
                      )}
                    </div>
                    <p className="font-body-sm text-body-sm text-secondary">
                      Custom instructions and domain guidelines for AI conversations within this workspace (e.g. format equations in LaTeX, adopt a Socratic tutoring tone, focus on corporate finance standards).
                    </p>
                    <textarea
                      rows={2}
                      value={editInstructions}
                      onChange={(e) => setEditInstructions(e.target.value)}
                      placeholder="e.g. Format all mathematical equations in LaTeX notation. Guide the student step by step with proofs."
                      className="w-full px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm outline-none border border-outline-variant/30 focus:border-primary transition-all"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleUpdateInstructions}
                        disabled={isUpdatingInstructions}
                        className="flex items-center gap-1 px-3 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-sm text-label-sm transition-colors border border-outline-variant/25 cursor-pointer disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[14px]">save</span>
                        <span>{isUpdatingInstructions ? "Saving..." : "Save AI Persona"}</span>
                      </button>
                    </div>
                  </div>

                  {exportNotice && (
                    <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 font-mono-sm text-mono-sm text-primary flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">info</span>
                      <span>{exportNotice}</span>
                    </div>
                  )}
                </div>

                {/* Attached Resources Filter & Table */}
                <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-space-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                    {/* Filter Pills */}
                    <div className="inline-flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                      {(["all", "document", "chat", "goal", "task", "memory"] as FilterType[]).map((ft) => (
                        <button
                          key={ft}
                          onClick={() => setResourceFilter(ft)}
                          className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm capitalize transition-colors cursor-pointer ${
                            resourceFilter === ft
                              ? "bg-surface-container-highest text-on-surface font-semibold"
                              : "hover:bg-surface-container text-secondary"
                          }`}
                        >
                          {ft === "all" ? `All (${resources.length})` : `${ft}s (${counts[ft as ResourceType] || 0})`}
                        </button>
                      ))}
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[15px] text-outline">
                        search
                      </span>
                      <input
                        type="text"
                        value={resourceSearch}
                        onChange={(e) => setResourceSearch(e.target.value)}
                        placeholder="Filter items..."
                        className="pl-7 pr-3 py-1 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm outline-none border border-outline-variant/25 focus:border-primary/50"
                      />
                    </div>
                  </div>

                  {/* Attached Resources List */}
                  {isResourcesLoading ? (
                    <div className="py-8 text-center text-secondary font-mono-sm text-mono-sm">
                      Loading attached items...
                    </div>
                  ) : filteredResources.length === 0 ? (
                    <div className="py-10 text-center flex flex-col items-center gap-2 text-secondary">
                      <span className="material-symbols-outlined text-[28px] text-outline">library_books</span>
                      <p className="font-body-sm text-body-sm text-on-surface">
                        {resources.length === 0
                          ? "No items attached to this workspace yet."
                          : "No items match your filter."}
                      </p>
                      {resources.length === 0 && (
                        <button
                          onClick={() => openItemPicker(selectedWorkspace.id)}
                          className="mt-1 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm cursor-pointer"
                        >
                          + Select Items to Bundle
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-outline-variant/15 mt-1">
                      {filteredResources.map((item) => (
                        <div
                          key={item.id}
                          className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-surface-container-low/60 rounded-lg transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`material-symbols-outlined text-[18px] p-1.5 rounded-md border shrink-0 ${getResourceBadge(
                                item.resource_type
                              )}`}
                            >
                              {getResourceIcon(item.resource_type)}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-label-md text-label-md text-on-surface font-medium truncate">
                                {item.title}
                              </span>
                              {item.subtitle && (
                                <span className="font-mono-sm text-[11px] text-secondary truncate">
                                  {item.subtitle}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono-sm text-[10px] uppercase px-1.5 py-0.5 rounded bg-surface-container text-outline">
                              {item.resource_type}
                            </span>
                            <button
                              onClick={() => handleRemoveSingleResource(item.id, item.title)}
                              className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors opacity-70 group-hover:opacity-100"
                              title="Remove from workspace"
                            >
                              <span className="material-symbols-outlined text-[15px]">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-12 text-center bg-surface-container-lowest rounded-xl border border-outline-variant/20 text-secondary">
                Select a workspace on the left to inspect its items and export.
              </div>
            )}
          </section>
        </div>

        {/* MODAL 1: Create New Workspace */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="w-full max-w-md bg-surface-container-lowest rounded-xl p-space-lg shadow-xl border border-outline-variant/30 flex flex-col gap-space-md">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">create_new_folder</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">New Workspace</h3>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded text-outline hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateWorkspace} className="flex flex-col gap-space-md">
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">Workspace Name *</label>
                  <input
                    type="text"
                    required
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="e.g. Physics 220 Exam Prep"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">Description (Optional)</label>
                  <textarea
                    rows={2}
                    value={newWsDesc}
                    onChange={(e) => setNewWsDesc(e.target.value)}
                    placeholder="Brief description of this course or research focus..."
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary resize-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-label-sm text-secondary">AI Instructions &amp; Persona (Optional)</label>
                  <textarea
                    rows={2}
                    value={newWsCustomInstructions}
                    onChange={(e) => setNewWsCustomInstructions(e.target.value)}
                    placeholder="e.g. In this workspace, format all equations using LaTeX and explain step by step..."
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md outline-none border border-outline-variant/30 focus:border-primary resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newWsName.trim()}
                    className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container disabled:opacity-50"
                  >
                    {isCreating ? "Creating..." : "Create Workspace"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: Item Selector Checklist Modal */}
        {showPickerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 flex flex-col max-h-[85vh] overflow-hidden">
              {/* Modal Header */}
              <div className="p-space-md border-b border-outline-variant/20 flex items-center justify-between shrink-0">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">checklist</span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">
                      Select Items for Workspace
                    </h3>
                  </div>
                  <span className="font-body-sm text-body-sm text-secondary mt-0.5">
                    Choose which PDFs, chats, milestones, and tasks to bundle in &ldquo;{selectedWorkspace?.name}&rdquo;
                  </span>
                </div>
                <button
                  onClick={() => setShowPickerModal(false)}
                  className="p-1 rounded text-outline hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="px-space-md py-space-xs border-b border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs shrink-0 bg-surface-container-low/40">
                <div className="inline-flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {(["all", "document", "chat", "goal", "task", "memory"] as FilterType[]).map((ft) => (
                    <button
                      key={ft}
                      onClick={() => setPickerFilter(ft)}
                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm capitalize transition-colors cursor-pointer ${
                        pickerFilter === ft
                          ? "bg-surface-container-highest text-on-surface font-semibold"
                          : "hover:bg-surface-container text-secondary"
                      }`}
                    >
                      {ft === "all" ? "All" : `${ft}s`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search available items..."
                    className="px-2.5 py-1 text-body-sm rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none w-44"
                  />
                  <button
                    onClick={() => handleSelectAllVisible(filteredAvailable)}
                    className="text-[12px] font-mono-sm text-primary hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-outline text-xs">/</span>
                  <button
                    onClick={() => handleDeselectAllVisible(filteredAvailable)}
                    className="text-[12px] font-mono-sm text-secondary hover:underline cursor-pointer"
                  >
                    Deselect
                  </button>
                </div>
              </div>

              {/* Items List (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-space-md flex flex-col divide-y divide-outline-variant/15">
                {filteredAvailable.length === 0 ? (
                  <div className="py-12 text-center text-secondary font-body-sm text-body-sm">
                    No items available in this category. Upload documents or create tasks to add them here.
                  </div>
                ) : (
                  filteredAvailable.map((item) => {
                    const key = `${item.resource_type}:${item.resource_id}`;
                    const isChecked = selectedResourceKeys.has(key);
                    return (
                      <div
                        key={key}
                        onClick={() => togglePickerItem(key)}
                        className={`py-2 px-2 flex items-center justify-between gap-3 rounded-lg cursor-pointer transition-colors ${
                          isChecked ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-surface-container-low"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePickerItem(key)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer"
                          />
                          <span
                            className={`material-symbols-outlined text-[16px] p-1 rounded border shrink-0 ${getResourceBadge(
                              item.resource_type
                            )}`}
                          >
                            {getResourceIcon(item.resource_type)}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="font-label-md text-label-md text-on-surface font-medium truncate">
                              {item.title}
                            </span>
                            {item.subtitle && (
                              <span className="font-mono-sm text-[11px] text-secondary truncate">
                                {item.subtitle}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="font-mono-sm text-[10px] uppercase px-1.5 py-0.5 rounded bg-surface-container text-outline shrink-0">
                          {item.resource_type}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-space-md border-t border-outline-variant/20 flex items-center justify-between shrink-0 bg-surface-container-lowest">
                <span className="font-mono-sm text-mono-sm text-secondary">
                  {selectedResourceKeys.size} item{selectedResourceKeys.size === 1 ? "" : "s"} selected
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPickerModal(false)}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSelection}
                    disabled={isSavingSelection}
                    className="px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingSelection ? "Saving..." : "Save Selection"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: On-Demand PDF Generator Modal */}
        {showPdfModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="p-space-md border-b border-outline-variant/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700">
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">
                      Generate PDF Dossier
                    </h3>
                    <span className="font-body-sm text-body-sm text-secondary">
                      Synthesize workspace items into an academic PDF or generative AI study guide
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="p-1 rounded text-outline hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-md">
                {/* Mode Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm text-label-sm font-semibold text-on-surface">
                    Generation Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div
                      onClick={() => setPdfMode("summary")}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                        pdfMode === "summary"
                          ? "bg-purple-50/50 border-purple-500 shadow-xs"
                          : "bg-surface-container-low/40 border-outline-variant/20 hover:border-outline-variant/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-label-md text-label-md font-semibold text-on-surface">
                          <span className="material-symbols-outlined text-[16px] text-purple-600">auto_awesome</span>
                          <span>AI Synthesis &amp; Study Guide</span>
                        </div>
                        <input
                          type="radio"
                          checked={pdfMode === "summary"}
                          onChange={() => setPdfMode("summary")}
                          className="text-purple-600"
                        />
                      </div>
                      <p className="font-body-sm text-[12px] text-secondary">
                        AI analyzes your selected chats, documents, and tasks to synthesize an executive study guide and key takeaways.
                      </p>
                    </div>

                    <div
                      onClick={() => setPdfMode("verbatim")}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                        pdfMode === "verbatim"
                          ? "bg-purple-50/50 border-purple-500 shadow-xs"
                          : "bg-surface-container-low/40 border-outline-variant/20 hover:border-outline-variant/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-label-md text-label-md font-semibold text-on-surface">
                          <span className="material-symbols-outlined text-[16px] text-purple-600">article</span>
                          <span>Full Verbatim Compilation</span>
                        </div>
                        <input
                          type="radio"
                          checked={pdfMode === "verbatim"}
                          onChange={() => setPdfMode("verbatim")}
                          className="text-purple-600"
                        />
                      </div>
                      <p className="font-body-sm text-[12px] text-secondary">
                        Compiles complete unedited conversational transcripts, milestone roadmaps, tasks, and document metadata.
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI Prompt Configuration (If Summary Mode) */}
                {pdfMode === "summary" && (
                  <div className="p-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-purple-600">tune</span>
                        <span>AI Synthesis Objective</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleApplyPreset("study_guide")}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono-sm transition-colors cursor-pointer ${
                            pdfPromptPreset === "study_guide"
                              ? "bg-purple-600 text-white font-medium"
                              : "bg-surface-container text-secondary hover:text-on-surface"
                          }`}
                        >
                          Study Guide
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset("executive_brief")}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono-sm transition-colors cursor-pointer ${
                            pdfPromptPreset === "executive_brief"
                              ? "bg-purple-600 text-white font-medium"
                              : "bg-surface-container text-secondary hover:text-on-surface"
                          }`}
                        >
                          Executive Brief
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset("qa_review")}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono-sm transition-colors cursor-pointer ${
                            pdfPromptPreset === "qa_review"
                              ? "bg-purple-600 text-white font-medium"
                              : "bg-surface-container text-secondary hover:text-on-surface"
                          }`}
                        >
                          Q&amp;A Review
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={pdfCustomPrompt}
                      onChange={(e) => {
                        setPdfCustomPrompt(e.target.value);
                        setPdfPromptPreset("custom");
                      }}
                      rows={2}
                      placeholder="Enter custom prompt instructions for the AI model..."
                      className="w-full px-3 py-2 text-body-sm rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none focus:border-purple-500 font-body-sm resize-none"
                    />
                  </div>
                )}

                {/* Metadata Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-on-surface font-medium">
                      Document Title
                    </label>
                    <input
                      type="text"
                      value={pdfTitle}
                      onChange={(e) => setPdfTitle(e.target.value)}
                      placeholder="e.g. Physics Prep Dossier"
                      className="px-3 py-1.5 text-body-sm rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-label-sm text-on-surface font-medium">
                      Subtitle / Memo
                    </label>
                    <input
                      type="text"
                      value={pdfSubtitle}
                      onChange={(e) => setPdfSubtitle(e.target.value)}
                      placeholder="e.g. Midterm Preparation Review"
                      className="px-3 py-1.5 text-body-sm rounded-lg bg-surface-container-lowest border border-outline-variant/30 outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* Content Picker Checklist */}
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center justify-between border-b border-outline-variant/15 pb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                        Select Content to Include
                      </span>
                      <span className="font-mono-sm text-[11px] text-outline">
                        ({pdfSelectedIds.size} of {resources.length} selected)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllPdf}
                        className="text-[12px] font-mono-sm text-purple-600 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-outline text-xs">/</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllPdf}
                        className="text-[12px] font-mono-sm text-secondary hover:underline cursor-pointer"
                      >
                        Deselect
                      </button>
                    </div>
                  </div>

                  {/* Filter Pills for PDF modal */}
                  <div className="inline-flex gap-1 overflow-x-auto pb-1">
                    {(["all", "document", "chat", "goal", "task", "memory"] as FilterType[]).map((ft) => (
                      <button
                        key={ft}
                        type="button"
                        onClick={() => setPdfFilter(ft)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono-sm capitalize transition-colors cursor-pointer ${
                          pdfFilter === ft
                            ? "bg-purple-100 text-purple-800 font-semibold"
                            : "hover:bg-surface-container text-secondary"
                        }`}
                      >
                        {ft === "all" ? "All" : `${ft}s`}
                      </button>
                    ))}
                  </div>

                  {/* Resources checklist */}
                  <div className="max-h-48 overflow-y-auto flex flex-col divide-y divide-outline-variant/15 border border-outline-variant/20 rounded-lg p-1 bg-surface-container-lowest">
                    {filteredPdfResources.length === 0 ? (
                      <div className="py-6 text-center text-secondary text-body-sm font-mono-sm text-[12px]">
                        No items found matching this filter.
                      </div>
                    ) : (
                      filteredPdfResources.map((item) => {
                        const isChecked = pdfSelectedIds.has(item.resource_id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => togglePdfItem(item.resource_id)}
                            className={`py-1.5 px-2 flex items-center justify-between gap-2.5 rounded cursor-pointer transition-colors ${
                              isChecked ? "bg-purple-50/50 hover:bg-purple-50" : "hover:bg-surface-container-low"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePdfItem(item.resource_id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-0 cursor-pointer"
                              />
                              <span
                                className={`material-symbols-outlined text-[15px] p-1 rounded border shrink-0 ${getResourceBadge(
                                  item.resource_type
                                )}`}
                              >
                                {getResourceIcon(item.resource_type)}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="font-label-md text-[13px] text-on-surface font-medium truncate">
                                  {item.title}
                                </span>
                                {item.subtitle && (
                                  <span className="font-mono-sm text-[10px] text-secondary truncate">
                                    {item.subtitle}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="font-mono-sm text-[9.5px] uppercase px-1 py-0.5 rounded bg-surface-container text-outline shrink-0">
                              {item.resource_type}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-space-md border-t border-outline-variant/20 flex items-center justify-between shrink-0 bg-surface-container-lowest">
                <span className="font-mono-sm text-mono-sm text-secondary">
                  Format: Styled A4 PDF &bull; {pdfSelectedIds.size} item{pdfSelectedIds.size === 1 ? "" : "s"}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPdfModal(false)}
                    disabled={isGeneratingPdf}
                    className="px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface text-label-md cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={isGeneratingPdf || pdfSelectedIds.size === 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-label-md text-label-md transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${isGeneratingPdf ? "animate-spin" : ""}`}>
                      {isGeneratingPdf ? "refresh" : "download"}
                    </span>
                    <span>{isGeneratingPdf ? "Compiling PDF..." : "Generate & Download PDF"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
