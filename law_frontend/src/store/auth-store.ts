/**
 * Auth store – manages authentication state with Zustand.
 */

import { api, ApiRequestError } from "@/lib/api";
import { create } from "zustand";

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getSessionMarkerAttributes() {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";

  return `; Path=/; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE}${secure}`;
}

function setSessionMarker() {
  if (typeof document === "undefined") return;
  document.cookie = `loopback_session=1${getSessionMarkerAttributes()}`;
}

function clearSessionMarker() {
  if (typeof document === "undefined") return;
  document.cookie = "loopback_session=; Path=/; SameSite=Lax; Max-Age=0";
  document.cookie = "access_token=; Path=/; SameSite=Lax; Max-Age=0";
  document.cookie = "refresh_token=; Path=/; SameSite=Lax; Max-Age=0";
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      await api.post("/auth/login", {
        email,
        password,
      });
      setSessionMarker();
      set({ isAuthenticated: true });

      const user = await api.get<User>("/users/me");
      set({ user });
    } catch (error) {
      set({ isAuthenticated: false, user: null });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password, fullName) => {
    set({ isLoading: true });
    try {
      await api.post("/auth/register", {
        email,
        password,
        full_name: fullName,
      });
      await api.post("/auth/login", {
        email,
        password,
      });
      setSessionMarker();
      set({ isAuthenticated: true });

      const user = await api.get<User>("/users/me");
      set({ user });
    } catch (error) {
      set({ isAuthenticated: false, user: null });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    } finally {
      clearSessionMarker();
      set({ user: null, isAuthenticated: false });
    }
  },

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const user = await api.get<User>("/users/me");
      set({ user, isAuthenticated: true });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        clearSessionMarker();
        set({ user: null, isAuthenticated: false });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  setUser: (user) => set({ user }),
}));
