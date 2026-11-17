"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MemoryRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/documents?tab=memory");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant font-sans">
      Redirecting to Pleadings, Briefs &amp; Chamber Knowledge Vault...
    </div>
  );
}
