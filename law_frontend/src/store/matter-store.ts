/**
 * Case Matter store – manages active Law firm matter enclaves & litigation dockets with Zustand.
 */

import { api } from "@/lib/api";
import { create } from "zustand";

export interface CaseMatterEntity {
  id: string;
  name: string;
  description: string | null;
  custom_instructions: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  case_number?: string;
  court_forum?: string;
  matter_type?: string;
  client_name?: string;
}

interface MatterState {
  matters: CaseMatterEntity[];
  activeMatter: CaseMatterEntity | null;
  isLoading: boolean;
  error: string | null;

  fetchMatters: () => Promise<void>;
  setActiveMatter: (matter: CaseMatterEntity) => Promise<void>;
  createMatter: (name: string, description?: string, customInstructions?: string) => Promise<CaseMatterEntity>;
}

export const useMatterStore = create<MatterState>((set, get) => ({
  matters: [],
  activeMatter: null,
  isLoading: false,
  error: null,

  fetchMatters: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<CaseMatterEntity[]>("/workspaces");
      const active = data.find((c) => c.is_active) || data[0] || null;
      set({ matters: data, activeMatter: active, isLoading: false });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Failed to load case matters",
        isLoading: false,
      });
    }
  },

  setActiveMatter: async (matter: CaseMatterEntity) => {
    try {
      await api.put("/workspaces/active", { workspace_id: matter.id });
      set((state) => ({
        activeMatter: matter,
        matters: state.matters.map((c) => ({
          ...c,
          is_active: c.id === matter.id,
        })),
      }));
    } catch (err: unknown) {
      console.error("Failed to set active case matter:", err);
      set({ activeMatter: matter });
    }
  },

  createMatter: async (name: string, description?: string, customInstructions?: string) => {
    set({ isLoading: true });
    try {
      const created = await api.post<CaseMatterEntity>("/workspaces", {
        name,
        description: description || "Litigation Docket & Case Matter Enclave",
        custom_instructions:
          customInstructions ||
          "Act as Senior Advocate and Legal Research Counsel. Cite binding Supreme Court and High Court precedents, maintain strict adherence to Limitation Act and CPC/CrPC timelines.",
      });

      set((state) => ({
        matters: [created, ...state.matters],
        activeMatter: created,
        isLoading: false,
      }));
      return created;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
