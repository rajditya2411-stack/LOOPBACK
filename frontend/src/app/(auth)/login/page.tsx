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
        setError(err.message || "Something went wrong. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="neo-auth min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo & Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-on-primary"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 className="text-headline-lg text-on-surface">Welcome back</h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            Sign in to your LoopBack workspace
          </p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" aria-live="assertive" className="mb-6 p-3 rounded-lg bg-error-container text-sm text-on-surface border border-error/20">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="login-email"
              className="text-label-sm text-on-surface-variant block mb-1.5"
            >
              EMAIL
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full h-11 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="text-label-sm text-on-surface-variant block mb-1.5"
            >
              PASSWORD
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full h-11 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-body-sm text-secondary hover:text-on-surface transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-lg bg-primary text-on-primary text-body-md font-medium hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Register link */}
        <p className="text-center text-body-sm text-on-surface-variant mt-8">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-on-surface font-medium hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
