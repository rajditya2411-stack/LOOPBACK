"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Settings, Check, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useUIStore } from "@/store/ui-store";

// ── Types ──────────────────────────────────────────────────────────────────

interface UserSettings {
  id: string;
  user_id: string;
  theme: "light" | "dark" | "system";
  language: string;
  ai_provider: string;
  ai_configured: boolean;
  ai_model: string;
  ai_temperature: string;
  ai_memory_enabled: boolean;
  email_notifications: boolean;
  task_reminders: boolean;
  ai_suggestions: boolean;
  storage_used_bytes: number;
}

interface AIProviderStatus {
  provider: string;
  model: string;
  configured: boolean;
}

type Theme = "light" | "dark" | "system";

interface FormState {
  theme: Theme;
  language: string;
  ai_provider: string;
  ai_api_key: string;
  ai_model: string;
  ai_temperature: string;
  ai_streaming: boolean;
  ai_memory_enabled: boolean;
  email_notifications: boolean;
  task_reminders: boolean;
  ai_suggestions: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [{ value: "gpt-4o-mini", label: "GPT-4o mini" }, { value: "gpt-4o", label: "GPT-4o" }],
  gemini: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }, { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }],
  xai: [{ value: "grok-4", label: "Grok 4" }, { value: "grok-3-mini", label: "Grok 3 Mini" }],
  anthropic: [{ value: "claude-sonnet-4-20250514", label: "Claude Sonnet" }, { value: "claude-3-5-haiku-latest", label: "Claude Haiku" }],
  kimi: [{ value: "moonshot-v1-8k", label: "Kimi 8K" }, { value: "kimi-k2-0711-preview", label: "Kimi K2" }],
};

function toFormState(s: UserSettings): FormState {
  return {
    theme: s.theme,
    language: s.language,
    ai_provider: s.ai_provider,
    ai_api_key: "",
    ai_model: s.ai_model,
    ai_temperature: s.ai_temperature,
    ai_streaming: true,
    ai_memory_enabled: s.ai_memory_enabled,
    email_notifications: s.email_notifications,
    task_reminders: s.task_reminders,
    ai_suggestions: s.ai_suggestions,
  };
}

function hasChanges(original: FormState, current: FormState): boolean {
  return (Object.keys(original) as (keyof FormState)[]).some(
    (key) => original[key] !== current[key],
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function SectionCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6">
      <h2 className="text-label-sm font-medium text-on-surface-variant uppercase tracking-wide">
        {title}
      </h2>
      <div className="mt-4 space-y-5">{children}</div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <label htmlFor={id} className="cursor-pointer text-body-md font-medium text-on-surface">
          {label}
        </label>
        <p className="mt-0.5 text-body-sm text-on-surface-variant">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`neo-toggle relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-container-high" />
        <div className="h-3 w-56 animate-pulse rounded bg-surface-container-high" />
      </div>
      <div className="h-6 w-11 animate-pulse rounded-full bg-surface-container-high" />
    </div>
  );
}

function SelectRow({
  id,
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body-md font-medium text-on-surface">
        {label}
      </label>
      <p className="text-body-sm text-on-surface-variant">{description}</p>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-body-sm text-on-surface outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const setTheme = useUIStore((s) => s.setTheme);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [providerStatus, setProviderStatus] = useState<AIProviderStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = useCallback(async () => {
    try {
      const [data, provider] = await Promise.all([
        api.get<UserSettings>("/settings"),
        api.get<AIProviderStatus>("/settings/ai-provider"),
      ]);
      setSettings(data);
      setProviderStatus(provider);
      const fs = toFormState(data);
      setForm(fs);
      setSavedForm(fs);
      setLoadError("");
      // Sync theme into UI store
      setTheme(data.theme);
    } catch {
      setLoadError("Could not load settings. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [setTheme]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const isDirty = form && savedForm ? hasChanges(savedForm, form) : false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || isSaving) return;

    // Validate temperature
    const temp = parseFloat(form.ai_temperature);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      showToast("error", "AI temperature must be a number between 0.0 and 2.0.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await api.put<UserSettings>("/settings", {
        theme: form.theme,
        language: form.language,
        ai_provider: form.ai_provider,
        ...(form.ai_api_key ? { ai_api_key: form.ai_api_key } : {}),
        ai_model: form.ai_model,
        ai_temperature: form.ai_temperature,
        ai_streaming: form.ai_streaming,
        ai_memory_enabled: form.ai_memory_enabled,
        email_notifications: form.email_notifications,
        task_reminders: form.task_reminders,
        ai_suggestions: form.ai_suggestions,
      });
      setSettings(updated);
      const fs = toFormState(updated);
      setForm(fs);
      setSavedForm(fs);
      // Sync theme after save
      setTheme(updated.theme);
      showToast("success", "Settings saved successfully.");
    } catch {
      showToast("error", "Could not save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (savedForm) setForm(savedForm);
  };

  const testConnection = async () => {
    if (!form || isTesting) return;
    setIsTesting(true);
    try {
      const result = await api.post<{ connected: boolean; message: string }>("/settings/ai/test", { ai_provider: form.ai_provider, ai_api_key: form.ai_api_key || undefined, ai_model: form.ai_model, ai_temperature: form.ai_temperature });
      showToast(result.connected ? "success" : "error", result.connected ? "Connected" : `Connection failed: ${result.message}`);
    } catch (error) { showToast("error", error instanceof Error ? `Connection failed: ${error.message}` : "Connection failed."); }
    finally { setIsTesting(false); }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="neo-settings flex flex-1 flex-col gap-8" aria-busy="true">
        <header className="rounded-[20px] border border-outline-variant bg-surface-container-lowest px-6 py-6">
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant">
            <Settings size={14} />
            Settings
          </div>
          <div className="mt-3 h-9 w-64 animate-pulse rounded-lg bg-surface-container-high" />
          <div className="mt-2 h-4 w-96 animate-pulse rounded bg-surface-container-high" />
        </header>
        <div className="grid gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-5">
              <div className="h-3 w-20 animate-pulse rounded bg-surface-container-high" />
              <div className="mt-3 h-8 w-24 animate-pulse rounded bg-surface-container-high" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6 space-y-5">
              <div className="h-3 w-28 animate-pulse rounded bg-surface-container-high" />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (loadError || !form || !settings) {
    return (
      <div className="neo-settings flex flex-1 flex-col gap-8">
        <header className="rounded-[20px] border border-outline-variant bg-surface-container-lowest px-6 py-6">
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant">
            <Settings size={14} /> Settings
          </div>
          <h1 className="mt-3 text-display-lg text-on-surface">Settings</h1>
        </header>
        <div className="flex min-h-48 flex-col items-center justify-center rounded-[20px] border border-outline-variant bg-surface-container-lowest text-center gap-4 p-8">
          <AlertCircle size={28} className="text-error" />
          <p className="text-body-md text-on-surface-variant">{loadError || "Something went wrong."}</p>
          <button
            type="button"
            onClick={() => { setIsLoading(true); setLoadError(""); void loadSettings(); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Computed display values ──────────────────────────────────────────────

  const themeLabel = form.theme === "light" ? "Light" : form.theme === "dark" ? "Dark" : "System";
  const modelLabel = providerStatus ? `${providerStatus.provider} / ${providerStatus.model}` : "Unavailable";
  const notificationsLabel = form.email_notifications || form.task_reminders || form.ai_suggestions ? "On" : "Off";
  const memoryLabel = form.ai_memory_enabled ? "Enabled" : "Disabled";

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="neo-settings flex flex-1 flex-col gap-8">
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 shadow-lg text-body-sm font-medium transition-all ${
            toast.type === "success"
              ? "border-primary/20 bg-surface-container-lowest text-on-surface"
              : "border-error/20 bg-error-container text-on-error-container"
          }`}
        >
          {toast.type === "success" ? (
            <Check size={16} className="text-primary" />
          ) : (
            <AlertCircle size={16} />
          )}
          {toast.message}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Header */}
        <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest px-6 py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 text-label-sm text-on-surface-variant">
                <Settings size={14} />
                Settings
              </div>
              <div className="space-y-2">
                <h1 className="text-display-lg-mobile text-on-surface lg:text-display-lg">
                  Tune the workspace behavior.
                </h1>
                <p className="max-w-xl text-body-md text-on-surface-variant">
                  Review appearance, AI defaults, and notification preferences in one quiet place.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isDirty && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low px-4 text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
                >
                  Discard changes
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving || !isDirty}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-body-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save settings"
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="mt-6 grid gap-4 lg:grid-cols-4">
          {[
            { label: "Theme", value: themeLabel, helper: form.theme === "system" ? "Syncs to OS" : "Fixed" },
            { label: "AI model", value: modelLabel.split("(")[0].trim(), helper: "Primary default" },
            { label: "Notifications", value: notificationsLabel, helper: "Workspace alerts" },
            { label: "Memory", value: memoryLabel, helper: "Persistent context" },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-5"
            >
              <p className="text-label-sm text-on-surface-variant">{metric.label}</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="text-display-lg-mobile text-on-surface">{metric.value}</p>
                <p className="pb-2 text-body-sm text-secondary">{metric.helper}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Settings panels */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Appearance & Language */}
          <SectionCard title="Appearance">
            <SelectRow
              id="settings-theme"
              label="Theme"
              description="Controls the color scheme of the workspace."
              value={form.theme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System (follows OS)" },
              ]}
              onChange={(v) => updateForm("theme", v as Theme)}
              disabled={isSaving}
            />
            <SelectRow
              id="settings-language"
              label="Language"
              description="Sets the interface display language."
              value={form.language}
              options={LANGUAGES}
              onChange={(v) => updateForm("language", v)}
              disabled={isSaving}
            />
          </SectionCard>

          {/* AI Preferences */}
          <SectionCard title="AI preferences">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Active AI provider</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Bring your own key. It is stored server-side for your account and never exposed to the browser after save.
                </p>
              </div>
              <div className="text-right text-sm text-[var(--text-primary)]">
                <p className="font-medium">{providerStatus?.provider ?? "Unavailable"}</p>
                <p className="mt-1 text-[var(--text-secondary)]">
                  {providerStatus?.model ?? "Backend not connected"}
                </p>
              </div>
            </div>
            <div className="grid gap-4 border-b border-[var(--border-subtle)] px-5 py-4 md:grid-cols-3">
              <label className="text-sm">Provider<select aria-label="AI provider" value={form.ai_provider} onChange={(e) => updateForm("ai_provider", e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3"><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="xai">Grok (xAI)</option><option value="anthropic">Claude</option><option value="kimi">Kimi</option></select></label>
              <label className="text-sm">API key<input aria-label="API key" type="password" autoComplete="off" placeholder={settings?.ai_configured ? "Saved key (leave blank to keep)" : "Paste your provider key"} value={form.ai_api_key} onChange={(e) => updateForm("ai_api_key", e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3" /></label>
              <label className="text-sm">Model<select aria-label="AI model" value={form.ai_model} onChange={(e) => updateForm("ai_model", e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3">{(AI_MODELS[form.ai_provider] ?? []).map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}{!(AI_MODELS[form.ai_provider] ?? []).some((model) => model.value === form.ai_model) && <option value={form.ai_model}>{form.ai_model}</option>}</select></label>
              <label className="text-sm">Temperature<input aria-label="Temperature" type="number" min="0" max="2" step="0.1" value={form.ai_temperature} onChange={(e) => updateForm("ai_temperature", e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-outline-variant bg-surface px-3" /></label>
            </div>
            <ToggleRow id="settings-ai-streaming" label="Streaming responses" description="Show responses as they arrive when supported by the provider." checked={form.ai_streaming} onChange={(value) => updateForm("ai_streaming", value)} disabled={isSaving} />
            <ToggleRow
              id="settings-ai-memory"
              label="AI memory"
              description="Allows the AI to recall context from previous conversations."
              checked={form.ai_memory_enabled}
              onChange={(v) => updateForm("ai_memory_enabled", v)}
              disabled={isSaving}
            />
          </SectionCard>

          {/* Notifications */}
          <SectionCard title="Notifications">
            <ToggleRow
              id="settings-email-notifications"
              label="Email notifications"
              description="Receive activity digests and important alerts by email."
              checked={form.email_notifications}
              onChange={(v) => updateForm("email_notifications", v)}
              disabled={isSaving}
            />
            <ToggleRow
              id="settings-task-reminders"
              label="Task reminders"
              description="Get notified when task due dates are approaching."
              checked={form.task_reminders}
              onChange={(v) => updateForm("task_reminders", v)}
              disabled={isSaving}
            />
            <ToggleRow
              id="settings-ai-suggestions"
              label="AI suggestions"
              description="Let the AI proactively surface helpful actions and insights."
              checked={form.ai_suggestions}
              onChange={(v) => updateForm("ai_suggestions", v)}
              disabled={isSaving}
            />
          </SectionCard>

          {/* Storage (read-only) */}
          <SectionCard title="Storage">
            <div className="flex flex-col gap-1.5">
              <p className="text-body-md font-medium text-on-surface">Storage used</p>
              <p className="text-body-sm text-on-surface-variant">
                Total size of uploaded documents and files in your workspace.
              </p>
              <p className="mt-1 text-display-lg-mobile text-on-surface">
                {formatBytes(settings.storage_used_bytes)}
              </p>
            </div>
          </SectionCard>
        </section>

        {/* Unsaved changes reminder */}
        {isDirty && (
          <p
            role="status"
            aria-live="polite"
            className="mt-4 text-center text-body-sm text-on-surface-variant"
          >
            You have unsaved changes.{" "}
            <button
              type="submit"
              disabled={isSaving}
              className="font-medium text-on-surface underline-offset-2 hover:underline"
            >
              Save now
            </button>
          </p>
        )}
      </form>
    </div>
  );
}
