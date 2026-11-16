"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MemoryRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/documents?tab=memory");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant">
      Redirecting to Knowledge &amp; Memory...
    </div>
  );
}
