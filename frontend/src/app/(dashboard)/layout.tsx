"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { NotificationsPanel } from "@/components/notifications-panel";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AiOrb } from "@/components/ai-orb";
import { useUIStore } from "@/store/ui-store";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const reduceMotion = useReducedMotion();

  // Auto-close sidebar on small screens for a cleaner initial layout
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1024 && isSidebarOpen) {
      toggleSidebar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell min-h-screen overflow-x-hidden bg-surface text-on-surface">
      <Sidebar />
      <NotificationsPanel />
      <div className="pointer-events-none fixed right-[-4rem] top-20 z-0 hidden opacity-70 xl:block">
        <AiOrb className="scale-[1.55]" label="" />
      </div>
      <main
        className={`min-h-screen transition-[padding-left] duration-200 ease-out ${
          isSidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"
        }`}
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: "easeOut" }}
          className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 sm:py-6"
        >
          <ProtectedRoute>{children}</ProtectedRoute>
        </motion.div>
      </main>
    </div>
  );
}
