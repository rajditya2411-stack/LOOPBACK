"use client";

import { create } from "zustand";
import { api } from "@/lib/api";

export interface WorkspaceItem {
  id: string;
  name: string;
  description: string | null;
  custom_instructions: string | null;
  owner_id: string;
  member_count: number;
  resource_count: number;
  role: "owner" | "admin" | "editor" | "viewer" | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WorkspaceState {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceItem | null;
  isLoading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
  updateWorkspaceInstructions: (workspaceId: string, custom_instructions: string | null) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspace: null,
  isLoading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<WorkspaceItem[]>("/workspaces");
      if (Array.isArray(data)) {
        const active = data.find((w) => w.is_active) || data[0] || null;
        set({
          workspaces: data,
          activeWorkspace: active,
          activeWorkspaceId: active ? active.id : null,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (err: unknown) {
      console.error("Failed to fetch workspaces:", err);
      set({ isLoading: false, error: "Failed to load workspaces" });
    }
  },

  setActiveWorkspace: async (workspaceId: string) => {
    try {
      await api.put("/workspaces/active", { workspace_id: workspaceId });
      const currentList = get().workspaces;
      const updatedList = currentList.map((w) => ({
        ...w,
        is_active: w.id === workspaceId,
      }));
      const newActive = updatedList.find((w) => w.id === workspaceId) || null;
      set({
        workspaces: updatedList,
        activeWorkspaceId: workspaceId,
        activeWorkspace: newActive,
      });
    } catch (err: unknown) {
      console.error("Failed to activate workspace:", err);
    }
  },

  updateWorkspaceInstructions: async (workspaceId: string, custom_instructions: string | null) => {
    try {
      const updated = await api.put<WorkspaceItem>(`/workspaces/${workspaceId}`, {
        custom_instructions,
      });
      const currentList = get().workspaces;
      const updatedList = currentList.map((w) => (w.id === workspaceId ? { ...w, ...updated } : w));
      const active = get().activeWorkspaceId === workspaceId ? { ...get().activeWorkspace, ...updated } as WorkspaceItem : get().activeWorkspace;
      set({
        workspaces: updatedList,
        activeWorkspace: active,
      });
    } catch (err: unknown) {
      console.error("Failed to update workspace instructions:", err);
      throw err;
    }
  },
}));
