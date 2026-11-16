"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { NotificationsPanel } from "@/components/notifications-panel";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useUIStore } from "@/store/ui-store";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { toggleSidebar, toggleNotificationsPanel } = useUIStore();
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pathname.startsWith("/chat")) return "AI Study Companion";
    if (pathname.startsWith("/documents")) return "Knowledge & Memory";
    if (pathname.startsWith("/tasks")) return "Milestones & Tasks";
    if (pathname.startsWith("/workspaces")) return "Workspaces & Bundles";
    if (pathname.startsWith("/settings")) return "Settings & Profile";
    if (pathname.startsWith("/search")) return "Search";
    return "Academic Workspace";
  };

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col">
      <Sidebar />
      <NotificationsPanel />

      {/* Top Protocol & Workspace Header */}
      <header className="fixed top-0 left-0 lg:left-[240px] right-0 h-12 bg-surface/85 backdrop-blur-md border-b border-outline-variant/20 z-20 flex items-center justify-between px-space-lg">
        <div className="flex items-center gap-space-sm text-on-surface-variant">
          <button
            onClick={() => toggleSidebar()}
            className="lg:hidden p-1 rounded hover:bg-surface-container text-on-surface transition-colors cursor-pointer mr-1"
            title="Open Menu"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>
          <span className="material-symbols-outlined text-[17px]">grid_view</span>
          <span className="font-label-sm text-label-sm text-outline">/</span>
          <span className="font-label-md text-label-md text-on-surface font-medium truncate">
            {getPageTitle()}
          </span>
          <span className="hidden sm:inline-flex font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
            LoopBack Student
          </span>
        </div>

        <div className="flex items-center gap-space-sm">
          <button
            onClick={() => alert("Keyboard shortcuts:\n• ⌘K : Global Search\n• ⌘N : New AI Inquiry\n• ⌘F : Filter Documents\n• Return : Send Prompt")}
            className="flex items-center justify-center w-7 h-7 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
            title="Keyboard Shortcuts & Documentation"
          >
            <span className="material-symbols-outlined text-[18px]">help_outline</span>
          </button>
          <button
            onClick={() => toggleNotificationsPanel()}
            className="flex items-center justify-center w-7 h-7 rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer relative"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[18px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary-container"></span>
          </button>
          <Link
            href="/settings"
            className="w-7 h-7 rounded-full bg-primary flex items-center justify-center ml-1 text-on-primary hover:opacity-90 transition-opacity"
            title="Student Profile"
          >
            <span className="material-symbols-outlined text-[16px]">person</span>
          </Link>
        </div>
      </header>

      {/* Main Routed Page Content */}
      <main className="w-full lg:pl-[240px] pt-12 min-h-screen bg-surface">
        <ProtectedRoute>{children}</ProtectedRoute>
      </main>
    </div>
  );
}
