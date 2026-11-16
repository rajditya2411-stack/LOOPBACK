/**
 * Client Enclave store – manages active CA client groups & entities with Zustand.
 */

import { api } from "@/lib/api";
import { create } from "zustand";

export interface ClientEntity {
  id: string;
  name: string;
  description: string | null;
  custom_instructions: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  pan?: string;
  gstin?: string;
  entity_type?: string;
}

interface ClientState {
  clients: ClientEntity[];
  activeClient: ClientEntity | null;
  isLoading: boolean;
  error: string | null;

  fetchClients: () => Promise<void>;
  setActiveClient: (client: ClientEntity) => Promise<void>;
  createClient: (name: string, description?: string, customInstructions?: string) => Promise<ClientEntity>;
}

export const useClientStore = create<ClientState>((set, get) => ({
  clients: [],
  activeClient: null,
  isLoading: false,
  error: null,

  fetchClients: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<ClientEntity[]>("/workspaces");
      const active = data.find((c) => c.is_active) || data[0] || null;
      set({ clients: data, activeClient: active, isLoading: false });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Failed to load clients",
        isLoading: false,
      });
    }
  },

  setActiveClient: async (client: ClientEntity) => {
    try {
      await api.put("/workspaces/active", { workspace_id: client.id });
      set((state) => ({
        activeClient: client,
        clients: state.clients.map((c) => ({
          ...c,
          is_active: c.id === client.id,
        })),
      }));
    } catch (err: unknown) {
      console.error("Failed to set active client:", err);
      // Optimistically set anyway
      set({ activeClient: client });
    }
  },

  createClient: async (name: string, description?: string, customInstructions?: string) => {
    set({ isLoading: true });
    try {
      const created = await api.post<ClientEntity>("/workspaces", {
        name,
        description: description || "Corporate Tax & Statutory Audit Client",
        custom_instructions:
          customInstructions ||
          "Act as Senior Tax Partner & Auditor. Enforce strict adherence to Income Tax Act, GST statutory deadlines, and Companies Act 2013.",
      });

      set((state) => ({
        clients: [created, ...state.clients],
        activeClient: created,
        isLoading: false,
      }));
      return created;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
