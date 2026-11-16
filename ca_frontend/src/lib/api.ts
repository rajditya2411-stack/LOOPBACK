/**
 * LoopBack CA API client – typed fetch wrapper with auth headers, CSRF handling, and error mapping.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:19000/api";

interface ApiError {
  detail?: unknown;
}

interface ValidationIssue {
  loc?: unknown;
  msg?: unknown;
}

export function formatApiErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((issue): string | null => {
        if (!issue || typeof issue !== "object") return null;
        const { loc, msg } = issue as ValidationIssue;
        if (typeof msg !== "string" || !msg.trim()) return null;
        const field = Array.isArray(loc)
          ? loc.filter((part) => typeof part === "string" && part !== "body").join(".")
          : "";
        return field ? `${field}: ${msg}` : msg;
      })
      .filter((message): message is string => Boolean(message));
    if (messages.length) return messages.join(" ");
  }

  return fallback;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiRequestError";
  }
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )loopback_csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrfToken = getCsrfToken();
  if (csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && !path.startsWith("/auth/")) {
    try {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (refreshResponse.ok) {
        const refreshedCsrfToken = getCsrfToken();
        if (refreshedCsrfToken) {
          headers.set("X-CSRF-Token", refreshedCsrfToken);
        }
        response = await fetch(`${API_BASE_URL}${path}`, {
          ...options,
          headers,
          credentials: "include",
        });
      }
    } catch (err) {
      console.error("Token refresh error:", err);
    }
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const errorBody: ApiError = await response.json();
      detail = formatApiErrorDetail(errorBody.detail, detail);
    } catch {
      // Body wasn't JSON
    }
    throw new ApiRequestError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const csrfToken = getCsrfToken();
  const headers: HeadersInit = csrfToken ? { "X-CSRF-Token": csrfToken } : {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    let detail = `Upload failed with status ${response.status}`;
    try {
      const errorBody: ApiError = await response.json();
      detail = formatApiErrorDetail(errorBody.detail, detail);
    } catch {
      // ignore
    }
    throw new ApiRequestError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

export interface StreamEvent<T = unknown> {
  event: string;
  data: T;
}

export interface StreamOptions {
  signal?: AbortSignal;
}

async function* stream(
  path: string,
  body: unknown,
  options: StreamOptions = {},
): AsyncGenerator<StreamEvent, void, unknown> {
  const csrfToken = getCsrfToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: JSON.stringify(body),
    signal: options.signal,
    credentials: "include",
  });

  if (!response.ok || !response.body) {
    let detail = "Streaming request failed";
    try {
      const errorBody: ApiError = await response.json();
      detail = formatApiErrorDetail(errorBody.detail, detail);
    } catch {
      // ignore
    }
    throw new ApiRequestError(response.status, detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  const parseEvent = (rawEvent: string): StreamEvent | null => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of rawEvent.split(/\r?\n/)) {
      if (line.startsWith("event: ")) event = line.slice(7);
      if (line.startsWith("data: ")) dataLines.push(line.slice(6));
    }
    if (!dataLines.length) return null;
    const data = dataLines.join("\n");
    try {
      return { event, data: JSON.parse(data) };
    } catch {
      throw new ApiRequestError(502, "The server sent an invalid streaming response.");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const separator = buffer.match(/\r?\n\r?\n/);
        const parsed = parseEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + (separator?.[0].length ?? 2));
        if (parsed) yield parsed;
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
    if (buffer.trim()) {
      const parsed = parseEvent(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

export const api = {
  get: <T>(path: string, options?: RequestInit) => request<T>(path, options),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),
  upload,
  stream,
};
