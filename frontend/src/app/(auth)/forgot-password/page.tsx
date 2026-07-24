"use client";

import { ApiRequestError, api } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      await api.post("/auth/forgot-password", { email });
      setSuccess(
        "If an account exists for that email, password reset instructions will be sent.",
      );
      setEmail("");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.detail);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <h1 className="text-headline-lg text-on-surface">Reset password</h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            We&apos;ll send a secure reset link to your inbox
          </p>
        </div>

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
              htmlFor="forgot-password-email"
              className="text-label-sm text-on-surface-variant block mb-1.5"
            >
              EMAIL
            </label>
            <input
              id="forgot-password-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full h-11 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-lg bg-primary text-on-primary text-body-md font-medium hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Sending link..." : "Send reset link"}
          </button>
        </form>

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
