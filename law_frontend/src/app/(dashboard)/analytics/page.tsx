"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalyticsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant font-sans">
      Redirecting to Litigation Cockpit &amp; Hearing Velocity...
    </div>
  );
}
