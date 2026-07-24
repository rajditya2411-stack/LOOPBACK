"use client";

import { ApiRequestError, api } from "@/lib/api";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="text-center w-full">
        <div className="mb-6 p-3 rounded-lg bg-error-container text-sm text-on-surface border border-error/20">
          Invalid or missing reset token.
        </div>
        <Link href="/forgot-password" className="text-primary font-medium hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);

    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setSuccess("Password has been successfully reset. Redirecting to login...");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const detail = err.detail.toLowerCase();
        setError(detail.includes("expired") || detail.includes("invalid")
          ? "This reset link is invalid or has expired. Request a new link to continue."
          : err.detail);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-6 p-3 rounded-lg bg-error-container text-sm text-on-surface border border-error/20">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-3 rounded-lg bg-surface-container-low text-sm text-on-surface border border-outline-variant">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="reset-password-input"
            className="text-label-sm text-on-surface-variant block mb-1.5"
          >
            NEW PASSWORD
          </label>
          <input
            id="reset-password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            className="w-full h-11 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="reset-password-confirm-input"
            className="text-label-sm text-on-surface-variant block mb-1.5"
          >
            CONFIRM NEW PASSWORD
          </label>
          <input
            id="reset-password-confirm-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full h-11 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || success !== ""}
          className="w-full h-11 rounded-lg bg-primary text-on-primary text-body-md font-medium hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Resetting..." : "Reset Password"}
        </button>
      </form>
      {error && error.toLowerCase().includes("invalid") && (
        <p className="mt-4 text-center text-body-sm text-on-surface-variant">
          <Link href="/forgot-password" className="text-primary font-medium hover:underline">Request a new reset link</Link>
        </p>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="neo-auth min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-[400px]">
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
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 className="text-headline-lg text-on-surface">Set new password</h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            Enter your new password below
          </p>
        </div>

        <Suspense fallback={<div className="text-center text-on-surface-variant">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>

        <p className="text-center text-body-sm text-on-surface-variant mt-8">
          Remembered it?{" "}
          <Link
            href="/login"
            className="text-on-surface font-medium hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
