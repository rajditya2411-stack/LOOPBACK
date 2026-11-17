"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/ui-store";

export default function SearchRedirect() {
  const router = useRouter();

  useEffect(() => {
    useUIStore.getState().openCommandPalette();
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant font-sans">
      Opening Legal Vault Search (⌘K)...
    </div>
  );
}
