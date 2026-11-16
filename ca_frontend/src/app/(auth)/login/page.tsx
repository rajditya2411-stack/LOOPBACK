"use client";

import { ApiRequestError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setError(err.detail);
      } else if (err instanceof Error) {
        setError(err.message || "Failed to sign in. Verify your credentials.");
      } else {
        setError("Failed to sign in. Verify your credentials.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4 font-sans">
      <div className="w-full max-w-[380px] bg-surface-container-lowest p-6 rounded-lg border border-outline-variant/30 shadow-xs">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary mb-3 shadow-xs">
            <span className="material-symbols-outlined text-white text-[22px]">account_balance</span>
          </div>
          <h1 className="font-headline font-semibold text-lg text-on-surface">
            LoopBack CA
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Chartered Accountant & Tax Advisory Hub
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded bg-error/10 border border-error/20 text-error text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              CA Firm Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@taxaudit.in"
              required
              className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              Master Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full px-3 py-2 text-xs rounded border border-outline-variant/40 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-hidden transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-3 rounded bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
          >
            {isLoading && (
              <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
            )}
            <span>Access CA Practice Portal</span>
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-outline-variant/20 text-center">
          <p className="text-xs text-on-surface-variant">
            New practice firm?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Create CA Partner Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
