"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { NotificationsPanel } from "@/components/notifications-panel";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useUIStore } from "@/store/ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { toggleSidebar, toggleNotificationsPanel } = useUIStore();
  const { activeWorkspace } = useWorkspaceStore();
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname === "/dashboard" || pathname.startsWith("/dashboard")) return "Litigation Cockpit & Practice Overview";
    if (pathname.startsWith("/chat")) return "Legal Advisory Copilot";
    if (pathname.startsWith("/documents")) return "Pleadings & Briefs Library";
    if (pathname.startsWith("/tasks")) return "Court Hearings & Filings Pipeline";
    if (pathname.startsWith("/workspaces")) return "Case Matters & Litigation Dockets";
    if (pathname.startsWith("/settings")) return "Advocate Bar Profile & Chamber Settings";
    if (pathname.startsWith("/search")) return "Legal Vault Search";
    if (pathname.startsWith("/limitation")) return "Limitation Period Calculator (Limitation Act 1963)";
    if (pathname.startsWith("/precedents")) return "Landmark Case Law Precedents (SC & HC)";
    if (pathname.startsWith("/causelist")) return "Cause List Hearing Board Tracker";
    return "Litigation Practice Management";
  };

  const currentMatterName = activeWorkspace?.name || "Active Docket";

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col">
      <Sidebar />
      <NotificationsPanel />

      {/* Top Protocol & Case Matter Header */}
      <header className="fixed top-0 left-0 lg:left-[240px] right-0 h-12 bg-surface/85 backdrop-blur-md border-b border-outline-variant/20 z-20 flex items-center justify-between px-space-lg">
        <div className="flex items-center gap-space-sm text-on-surface-variant min-w-0">
          <button
            type="button"
            onClick={() => toggleSidebar()}
            className="lg:hidden p-1 rounded hover:bg-surface-container text-on-surface transition-colors cursor-pointer mr-1"
            title="Open Menu"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>
          <span className="material-symbols-outlined text-[17px] shrink-0">gavel</span>
          <span className="font-label-sm text-label-sm text-outline shrink-0">/</span>
          <span className="font-label-md text-label-md text-on-surface font-medium truncate">
            {getPageTitle()}
          </span>
          <span className="hidden sm:inline-flex font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-outline-variant/30 shrink-0">
            Matter: {currentMatterName}
          </span>
          <span className="hidden md:inline-flex font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed border border-primary-fixed-dim shrink-0">
            LoopBack Law
          </span>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <button
            type="button"
            onClick={() => alert("Chamber Shortcuts:\n• ⌘K : Legal Vault Search\n• ⌘N : New Advisory Inquiry\n• ⌘F : Filter Pleadings\n• Return : Execute Prompt")}
            className="flex items-center justify-center w-7 h-7 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
            title="Advocate Shortcuts & Documentation"
          >
            <span className="material-symbols-outlined text-[18px]">help_outline</span>
          </button>
          <button
            type="button"
            onClick={() => toggleNotificationsPanel()}
            className="flex items-center justify-center w-7 h-7 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer relative"
            title="Hearing Alerts"
          >
            <span className="material-symbols-outlined text-[18px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary-container"></span>
          </button>
          <Link
            href="/settings"
            className="w-7 h-7 rounded-full bg-primary flex items-center justify-center ml-1 text-on-primary hover:opacity-90 transition-opacity"
            title="Advocate Bar Profile"
          >
            <span className="material-symbols-outlined text-[16px]">person</span>
          </Link>
        </div>
      </header>

      {/* Main Routed Page Content with Fixed Sidebar Left Padding */}
      <main className="w-full lg:pl-[240px] pt-12 min-h-screen bg-surface">
        <ProtectedRoute>{children}</ProtectedRoute>
      </main>
    </div>
  );
}
