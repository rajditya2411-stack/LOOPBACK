"use client";

import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { api } from "@/lib/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface WorkspaceMeta {
  id: string;
  name: string;
  is_active: boolean;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard & Analytics", icon: "dashboard" },
  { href: "/chat", label: "AI Study Companion", icon: "chat" },
  { href: "/documents", label: "Knowledge & Memory", icon: "menu_book" },
  { href: "/tasks", label: "Milestones & Tasks", icon: "check_box" },
  { href: "/workspaces", label: "Workspaces & Bundles", icon: "folder_copy" },
  { href: "/settings", label: "Settings & Identity", icon: "tune" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [currentWorkspace, setCurrentWorkspace] = useState("Personal Sandbox");
  const [workspaceList, setWorkspaceList] = useState<WorkspaceMeta[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      api.get<WorkspaceMeta[]>("/workspaces")
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setWorkspaceList(data);
            const active = data.find((w) => w.is_active) || data[0];
            setCurrentWorkspace(active.name);
          }
        })
        .catch(() => {});
    }
  }, [user, pathname]);

  const handleSwitchWorkspace = async (ws: WorkspaceMeta) => {
    try {
      await api.put("/workspaces/active", { workspace_id: ws.id });
      setCurrentWorkspace(ws.name);
      setWorkspaceList((prev) => prev.map((w) => ({ ...w, is_active: w.id === ws.id })));
      setWorkspaceMenuOpen(false);
    } catch (err) {
      console.error("Failed to switch workspace:", err);
    }
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
        setWorkspaceMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (name?: string | null) => {
    if (!name) return "AV";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => toggleSidebar()}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-[240px] bg-surface-container-low border-r border-outline-variant/30 flex flex-col z-30 select-none transition-transform duration-200 lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Top Header */}
        <div className="p-space-md pb-space-sm border-b border-outline-variant/20 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-space-sm">
              <div className="w-6 h-6 rounded bg-on-surface flex items-center justify-center">
                <span className="material-symbols-outlined text-surface text-[15px]">
                  all_inclusive
                </span>
              </div>
              <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface">
                LoopBack
              </span>
            </Link>
            <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-outline-variant/40">
              Academic
            </span>
          </div>

          {/* Workspace Switcher */}
          <div className="relative">
            <button
              onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
              className="flex items-center justify-between w-full px-space-sm py-1 rounded bg-surface-container-lowest border border-outline-variant/30 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:bg-surface-container transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-space-xs truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container shrink-0"></span>
                <span className="font-label-md text-label-md text-on-surface truncate">
                  {currentWorkspace}
                </span>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant text-[16px] shrink-0">
                unfold_more
              </span>
            </button>

            {workspaceMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-lowest border border-outline-variant/30 rounded-lg shadow-lg py-1 z-50">
                {(workspaceList.length > 0 ? workspaceList : [{ id: "default", name: currentWorkspace, is_active: true }]).map(
                  (ws) => (
                    <button
                      key={ws.id}
                      onClick={() => handleSwitchWorkspace(ws)}
                      className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container flex items-center justify-between cursor-pointer"
                    >
                      <span className="truncate">{ws.name}</span>
                      {ws.name === currentWorkspace && (
                        <span className="material-symbols-outlined text-primary text-[14px]">
                          check
                        </span>
                      )}
                    </button>
                  )
                )}
                <div className="border-t border-outline-variant/20 mt-1 pt-1">
                  <Link
                    href="/workspaces"
                    onClick={() => setWorkspaceMenuOpen(false)}
                    className="w-full text-left px-3 py-1 text-mono-sm text-primary hover:bg-surface-container flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Manage Workspaces
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Quick Search */}
          <button
            onClick={() => router.push("/search")}
            className="flex items-center justify-between w-full px-space-sm py-1 rounded bg-surface-container-high/60 border border-outline-variant/25 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">search</span>
              <span className="font-body-sm text-body-sm">Search or jump...</span>
            </div>
            <kbd className="font-mono-sm text-mono-sm px-1 py-0.2 rounded bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Navigation Core */}
        <div className="flex-1 overflow-y-auto px-space-sm py-space-sm">
          <div className="px-space-xs pb-space-xs font-mono-sm text-mono-sm uppercase tracking-wider text-outline">
            Appliance Core
          </div>
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (window.innerWidth < 1024) toggleSidebar();
                  }}
                  className={`flex items-center gap-space-sm px-space-sm py-1.5 rounded transition-colors font-body-md text-body-md ${
                    active
                      ? "bg-surface-container-highest text-on-surface font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[17px] ${
                      active ? "text-primary" : "text-outline"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Status & Profile */}
        <div
          ref={menuRef}
          className="p-space-sm border-t border-outline-variant/30 flex flex-col gap-space-sm bg-surface-container-low relative"
        >
          {/* Privacy status pill */}
          <div className="flex items-center justify-between px-space-xs py-1 rounded bg-surface-container-high/40 border border-outline-variant/20">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="font-mono-sm text-mono-sm text-on-surface-variant">
                Private &amp; On-Device
              </span>
            </div>
            <span className="material-symbols-outlined text-outline text-[13px]">lock</span>
          </div>

          {/* User profile row */}
          <div className="flex items-center justify-between px-space-xs py-1">
            <Link
              href="/settings"
              className="flex items-center gap-2 min-w-0 group cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-surface-container-highest border border-outline-variant/40 flex items-center justify-center font-mono-sm text-mono-sm text-on-surface shrink-0 font-medium">
                {getInitials(user?.full_name)}
              </div>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="font-label-md text-label-md text-on-surface truncate group-hover:text-primary transition-colors">
                  {user?.full_name || "Alex Vance"}
                </span>
                <span className="font-mono-sm text-mono-sm text-outline truncate">
                  CS &amp; Math
                </span>
              </div>
            </Link>

            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container transition-colors shrink-0 cursor-pointer"
              title="User Options"
            >
              <span className="material-symbols-outlined text-[17px]">more_vert</span>
            </button>
          </div>

          {/* User Dropdown Menu */}
          {userMenuOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-2 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-lg p-1.5 z-50 flex flex-col gap-1">
              <Link
                href="/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body-sm text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] text-outline">tune</span>
                Settings &amp; Profile
              </Link>
              <div className="border-t border-outline-variant/20 my-0.5"></div>
              <button
                onClick={async () => {
                  setUserMenuOpen(false);
                  await logout();
                  router.push("/login");
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-body-sm text-error hover:bg-error-container/30 transition-colors w-full text-left cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
