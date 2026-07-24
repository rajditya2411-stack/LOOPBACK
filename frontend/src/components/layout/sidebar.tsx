"use client";

import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { useQueryClient } from "@tanstack/react-query";
import {
    BarChart3,
    Brain,
    CheckSquare,
    FileText,
    FolderGit2,
    LayoutDashboard,
    LogOut,
    MessageSquare,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    Settings,
    Target,
    UserCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Search", icon: Search },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/workspaces", label: "Workspaces", icon: FolderGit2 },
];

const bottomItems = [
  { href: "/profile", label: "Profile", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSidebarCollapsed, collapseSidebar, expandSidebar } = useUIStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      {/* Overlay for small screens */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
          isSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => toggleSidebar()}
      />

      <aside
        className={`neo-sidebar fixed top-0 left-0 z-40 flex h-full transform flex-col border-r border-outline-variant/80 bg-surface-container-lowest/85 shadow-[16px_0_48px_rgba(0,0,0,0.14)] backdrop-blur-xl transition-all duration-200 ease-out lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${isSidebarCollapsed ? "w-[72px]" : "w-[260px]"}`}
      >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-outline-variant/80 px-4">
        {!isSidebarCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="neo-brand-mark w-9 h-9 rounded-md bg-primary flex items-center justify-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-on-primary"
                aria-hidden="true"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <span className="neo-brand-name text-body-md font-medium text-on-surface">
              LoopBack
            </span>
          </Link>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              isSidebarCollapsed ? expandSidebar() : collapseSidebar()
            }
            className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>

          {/* Mobile menu toggle */}
          <button
            onClick={() => toggleSidebar()}
            className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
            aria-label="Toggle sidebar"
          >
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-3 py-3">
        <button
          onClick={() => useUIStore.getState().openCommandPalette()}
          className={`neo-search-trigger flex h-10 w-full items-center gap-2.5 rounded-xl border border-outline-variant bg-surface-container-low/70 px-3 text-body-sm text-on-surface-variant transition-colors hover:border-outline hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            isSidebarCollapsed ? "justify-center" : ""
          }`}
        >
          <Search size={16} />
          {!isSidebarCollapsed && (
            <>
              <span className="flex-1 text-left">Search...</span>
              <kbd className="text-label-sm text-on-surface-variant/60 bg-surface-container-high px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`neo-nav-item flex h-10 items-center gap-2.5 rounded-xl px-3 text-body-sm transition-colors ${
                active
                  ? "bg-primary-container text-on-primary font-medium shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              } ${isSidebarCollapsed ? "justify-center px-0" : ""}`}
              title={isSidebarCollapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} />
              {!isSidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-outline-variant space-y-0.5">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`neo-nav-item flex h-10 items-center gap-2.5 rounded-xl px-3 text-body-sm transition-colors ${
                active
                  ? "bg-primary-container text-on-primary font-medium shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              } ${isSidebarCollapsed ? "justify-center px-0" : ""}`}
              title={isSidebarCollapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} />
              {!isSidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* User / Logout */}
        <div
          className={`neo-user-card flex h-11 items-center gap-2.5 rounded-xl px-3 ${
            isSidebarCollapsed ? "justify-center px-0" : ""
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center text-label-sm text-on-surface">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          {!isSidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-body-sm text-on-surface truncate font-medium">
                  {user?.full_name ?? "Guest"}
                </p>
              </div>
              <button
                onClick={() =>
                  void logout().finally(() => {
                    queryClient.clear();
                    router.replace("/login");
                  })
                }
                className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Logout"
              >
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}
