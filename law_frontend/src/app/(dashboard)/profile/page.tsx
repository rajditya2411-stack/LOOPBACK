"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings?tab=profile");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant font-sans">
      Redirecting to Advocate Bar Profile &amp; Chamber Standing...
    </div>
  );
}
