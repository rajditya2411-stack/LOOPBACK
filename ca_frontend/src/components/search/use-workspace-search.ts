"use client";

import { api } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import type { SearchResultItem, SearchType } from "./search-types";

export function useWorkspaceSearch(query: string, types: SearchType[] = [], limit = 20) {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const requestRef = useRef<AbortController | null>(null);

  const normalizedQuery = query.trim();
  const typeKey = types.join(",");

  useEffect(() => {
    requestRef.current?.abort();
    if (!normalizedQuery) {
      setResults([]);
      setError("");
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setIsSearching(true);
    setError("");
    const timer = window.setTimeout(() => {
      const filterParams = (typeKey ? typeKey.split(",") : []).map((type) => `types=${encodeURIComponent(type)}`).join("&");
      void api.get<SearchResultItem[]>(`/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}${filterParams ? `&${filterParams}` : ""}`, { signal: controller.signal })
        .then((response) => {
          if (!controller.signal.aborted) setResults(response);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
          setResults([]);
          setError(cause instanceof Error ? cause.message : "Search could not be completed.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, typeKey, limit, retryToken]);

  return { results, isSearching, error, retry: () => setRetryToken((current) => current + 1) };
}
