"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GoalsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tasks");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant font-sans">
      Redirecting to Court Hearings &amp; Procedural Filings Pipeline...
    </div>
  );
}
