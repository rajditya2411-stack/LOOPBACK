"use client";

import { useAuthStore } from "@/store/auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProtectedRoute({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const [mounted, setMounted] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void fetchUser().finally(() => setCheckingSession(false));
  }, [fetchUser, mounted]);

  useEffect(() => {
    if (mounted && !checkingSession && !isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [checkingSession, isAuthenticated, isLoading, router, mounted]);

  if (!mounted || checkingSession || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="skeleton h-6 w-48 rounded-md" />
      </div>
    );
  }

  return <>{children}</>;
}
