/**
 * UI store – manages sidebar state, modals, and theme with Zustand.
 */

import { create } from "zustand";

interface UIState {
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  collapseSidebar: () => void;
  expandSidebar: () => void;

  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  isNotificationsPanelOpen: boolean;
  toggleNotificationsPanel: () => void;

  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  isSidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  collapseSidebar: () => set({ isSidebarCollapsed: true }),
  expandSidebar: () => set({ isSidebarCollapsed: false }),

  isCommandPaletteOpen: false,
  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((state) => ({
      isCommandPaletteOpen: !state.isCommandPaletteOpen,
    })),

  isNotificationsPanelOpen: false,
  toggleNotificationsPanel: () =>
    set((state) => ({
      isNotificationsPanelOpen: !state.isNotificationsPanelOpen,
    })),

  theme: "dark",
  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.classList.remove("dark");
      if (theme === "dark") {
        root.classList.add("dark");
      } else if (theme === "system") {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          root.classList.add("dark");
        }
      }
    }
  },
}));
