"use client";

import { useUIStore } from "@/store/ui-store";
import { Bell, Eye, FileText, FolderGit2, LayoutDashboard, Menu, MessageSquare, Search, Settings, ShieldCheck, Scale, Users, Gavel, Calendar, Clock, CheckSquare, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { SearchResultGroups } from "@/components/search/search-result-groups";
import { searchTypes, type SearchType } from "@/components/search/search-types";
import { useWorkspaceSearch } from "@/components/search/use-workspace-search";

type StaticAction = { label: string; description: string; icon: typeof LayoutDashboard; href?: string; run?: () => void };
const staticActions: StaticAction[] = [
  { label: "Search Legal Vault", description: "Search all pleadings, precedents, cause lists, and case dockets", icon: Search, href: "/search" },
  { label: "Litigation Cockpit", description: "Chamber operational overview, cause lists & hearing velocity", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Case Matters", description: "Litigation dockets, client matters & custom chamber guidelines", icon: FolderGit2, href: "/workspaces" },
  { label: "Pleadings & Briefs", description: "Plaints, written statements, affidavits & documentary evidence", icon: FileText, href: "/documents" },
  { label: "Court Hearings & Filings", description: "4-stage procedural hearings board & statutory filing milestones", icon: CheckSquare, href: "/tasks" },
  { label: "Legal Advisory Copilot", description: "Grounded legal research counsel with statutory citations", icon: MessageSquare, href: "/chat" },
  { label: "Limitation Calculator", description: "Limitation Act 1963, Sec 18 renewal & Commercial Courts 120-day limit", icon: Clock, href: "/limitation" },
  { label: "Case Law Precedents", description: "Landmark Supreme Court & High Court binding ratios and citations", icon: Scale, href: "/precedents" },
  { label: "Cause List Tracker", description: "Daily court boards, items in progress & live hearing stages", icon: Calendar, href: "/causelist" },
  { label: "Advocate Bar Profile", description: "Bar Council enrollment, chamber standing & AI providers", icon: Settings, href: "/settings" },
  { label: "Toggle sidebar", description: "Collapse or expand the chamber navigation rail", icon: Menu, run: () => useUIStore.getState().toggleSidebar() },
  { label: "Toggle notifications", description: "Open or close hearing alerts and statutory reminders", icon: Bell, run: () => useUIStore.getState().toggleNotificationsPanel() },
  { label: "Toggle theme", description: "Switch between light and dark mode", icon: Eye, run: () => { const theme = useUIStore.getState().theme; useUIStore.getState().setTheme(theme === "dark" ? "light" : "dark"); } },
];

export function CommandPalette() {
  const router = useRouter();
  const isOpen = useUIStore((state) => state.isCommandPaletteOpen);
  const close = useUIStore((state) => state.closeCommandPalette);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchType[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isSearching, error, retry } = useWorkspaceSearch(query, filters);
  const commandMatches = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? staticActions.filter((action) => action.label.toLowerCase().includes(value) || action.description.toLowerCase().includes(value)) : staticActions;
  }, [query]);
  const itemCount = commandMatches.length + results.length;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); useUIStore.getState().openCommandPalette(); }
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);
  useEffect(() => { if (isOpen) inputRef.current?.focus(); else { setQuery(""); setFilters([]); } }, [isOpen]);
  useEffect(() => setActiveIndex(0), [itemCount]);

  const selectStatic = (action: StaticAction) => { if (action.href) router.push(action.href); else action.run?.(); close(); };
  const selectResult = (url: string) => { router.push(url); close(); };
  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!itemCount) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((value) => (value + 1) % itemCount); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => (value === 0 ? itemCount - 1 : value - 1)); }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex < commandMatches.length) selectStatic(commandMatches[activeIndex]);
      else { const result = results[activeIndex - commandMatches.length]; if (result) selectResult(result.url); }
    }
  };
  const toggleFilter = (type: SearchType) => setFilters((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  if (!isOpen) return null;

  return (
    <div className="neo-command-palette fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-20 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={close} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Law workspace search" className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <div className="flex items-center gap-3 border-b border-outline-variant px-4 py-4">
          <Search size={18} className="text-on-surface-variant" />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onInputKeyDown} placeholder="Search case matters, pleadings, precedents, or commands..." className="h-11 w-full bg-transparent text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none" />
          {isSearching && <span className="animate-pulse text-xs text-on-surface-variant">Searching...</span>}
          <button type="button" onClick={close} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high cursor-pointer" aria-label="Close search">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-outline-variant px-4 py-2.5" aria-label="Filter search results">
          {searchTypes.map((type) => (
            <button key={type} type="button" onClick={() => toggleFilter(type)} aria-pressed={filters.includes(type)} className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${filters.includes(type) ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"}`}>
              {type}
            </button>
          ))}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {error ? (
            <div className="px-3 py-8 text-center">
              <p className="text-body-sm text-error">{error}</p>
              <button type="button" onClick={retry} className="mt-3 rounded-lg bg-primary px-3 py-2 text-body-sm font-medium text-on-primary cursor-pointer">
                Retry search
              </button>
            </div>
          ) : (
            <>
              {commandMatches.length > 0 && (
                <section aria-labelledby="command-results">
                  <h2 id="command-results" className="px-2 text-label-sm text-on-surface-variant">Chamber Commands</h2>
                  <div className="mt-1 space-y-1">
                    {commandMatches.map((action, index) => {
                      const Icon = action.icon;
                      return (
                        <button key={action.label} type="button" onClick={() => selectStatic(action)} aria-current={activeIndex === index ? "true" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer ${activeIndex === index ? "bg-surface-container-high" : "hover:bg-surface-container-low"}`}>
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low"><Icon size={17} /></span>
                          <span className="min-w-0">
                            <span className="block text-body-sm font-medium text-on-surface">{action.label}</span>
                            <span className="block text-body-sm text-on-surface-variant">{action.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              {results.length > 0 && (
                <div className={commandMatches.length ? "mt-4 border-t border-outline-variant pt-4" : ""}>
                  <SearchResultGroups results={results} activeIndex={activeIndex - commandMatches.length} onSelect={(result) => selectResult(result.url)} />
                </div>
              )}
              {query.trim() && !isSearching && !commandMatches.length && !results.length && (
                <p className="px-3 py-8 text-center text-body-sm text-on-surface-variant">No results match your search.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
