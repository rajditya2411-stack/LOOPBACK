"use client";

import { Clock3, Command, CornerDownLeft, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SearchResultGroups } from "@/components/search/search-result-groups";
import { groupSearchResults, searchTypes, type SearchType } from "@/components/search/search-types";
import { useWorkspaceSearch } from "@/components/search/use-workspace-search";

const RECENT_SEARCHES_KEY = "loopback.recent_searches";
const suggestedSearches = ["Open tasks", "Weekly goals", "Project decisions"];

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialTypes = useMemo(() => searchParams.getAll("types").filter((value): value is SearchType => searchTypes.includes(value as SearchType)), [searchParams]);
  const [query, setQuery] = useState(initialQuery);
  const [types, setTypes] = useState<SearchType[]>(initialTypes);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { results, isSearching, error, retry } = useWorkspaceSearch(query, types, 50);
  const orderedResults = useMemo(() => groupSearchResults(results).flatMap(([, items]) => items), [results]);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => setTypes(initialTypes), [initialTypes]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
      if (Array.isArray(stored)) setRecentSearches(stored.filter((item): item is string => typeof item === "string").slice(0, 5));
    } catch { /* Ignore an invalid saved search history. */ }
  }, []);
  useEffect(() => setActiveIndex(-1), [query, types]);

  const updateUrl = (nextQuery: string, nextTypes = types) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    nextTypes.forEach((type) => params.append("types", type));
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  };
  const saveRecentSearch = (value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    const next = [cleaned, ...recentSearches.filter((item) => item.toLowerCase() !== cleaned.toLowerCase())].slice(0, 5);
    setRecentSearches(next);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  };
  const selectSearch = (value: string) => {
    setQuery(value);
    updateUrl(value);
    saveRecentSearch(value);
  };
  const toggleType = (type: SearchType) => {
    const next = types.includes(type) ? types.filter((item) => item !== type) : [...types, type];
    setTypes(next);
    updateUrl(query, next);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && orderedResults.length) {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, orderedResults.length - 1));
    } else if (event.key === "ArrowUp" && orderedResults.length) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && orderedResults[activeIndex]) router.push(orderedResults[activeIndex].url);
      else saveRecentSearch(query);
    } else if (event.key === "Escape") {
      setActiveIndex(-1);
    }
  };

  return (
    <div className="neo-search-page flex flex-1 flex-col gap-6">
      <section className="neo-search-hero rounded-[20px] border border-outline-variant bg-surface-container-lowest p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="neo-eyebrow inline-flex items-center gap-2 text-label-md text-on-surface-variant"><Sparkles size={14} /> Workspace search</p>
          <span className="neo-key-hint"><Command size={13} /> K to search</span>
        </div>
        <h1 className="mt-4 text-display-lg text-on-surface">Find work and context.</h1>
        <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">Search tasks, goals, documents, memories, and conversations from one focused place.</p>
        <div className="neo-search-field mt-7 flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4">
          <Search size={21} className="text-on-surface" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); updateUrl(event.target.value); }} onKeyDown={handleKeyDown} placeholder="Search your workspace" autoFocus className="h-14 w-full bg-transparent text-body-md text-on-surface outline-none placeholder:text-on-surface-variant" />
          {isSearching ? <span className="neo-searching animate-pulse">Searching</span> : query ? <button type="button" onClick={() => selectSearch("")} className="neo-search-clear" aria-label="Clear search"><X size={16} /></button> : <kbd className="hidden sm:inline-flex">ESC</kbd>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1 text-body-sm text-on-surface-variant"><SlidersHorizontal size={15} /> Filter</span>
          {searchTypes.map((type) => <button key={type} type="button" onClick={() => toggleType(type)} aria-pressed={types.includes(type)} className={`neo-filter-chip rounded-full px-3 py-1.5 text-body-sm capitalize transition-colors ${types.includes(type) ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"}`}>{type}</button>)}
        </div>
      </section>

      <section className="neo-search-panel rounded-[20px] border border-outline-variant bg-surface-container-lowest p-5 md:p-6">
        {error ? <div className="py-12 text-center"><p role="alert" className="text-body-md text-error">{error}</p><button type="button" onClick={retry} className="neo-primary-button mt-4 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary">Retry search</button></div>
          : !query.trim() ? <div className="neo-search-empty py-8 md:py-12"><div className="neo-empty-icon"><Search size={23} /></div><h2>Start with a thought.</h2><p>Find a task, decision, document topic, or conversation.</p><div className="mt-6"><span className="neo-eyebrow">Suggested searches</span><div className="mt-3 flex flex-wrap justify-center gap-2">{suggestedSearches.map((item) => <button key={item} type="button" onClick={() => selectSearch(item)} className="neo-suggestion">{item}<CornerDownLeft size={13} /></button>)}</div></div>{recentSearches.length > 0 && <div className="mt-7"><span className="neo-eyebrow inline-flex items-center gap-2"><Clock3 size={13} /> Recent</span><div className="mt-3 flex flex-wrap justify-center gap-2">{recentSearches.map((item) => <button key={item} type="button" onClick={() => selectSearch(item)} className="neo-suggestion">{item}</button>)}</div></div>}</div>
          : isSearching && !results.length ? <div className="neo-search-empty py-12"><div className="neo-empty-icon animate-pulse"><Sparkles size={23} /></div><h2>Looking through your workspace.</h2><p>Matching tasks, documents, conversations, and more.</p></div>
          : results.length ? <><div className="mb-5 flex items-center justify-between"><p className="neo-eyebrow">{results.length} result{results.length === 1 ? "" : "s"}</p><p className="hidden text-label-sm text-on-surface-variant sm:block">↑ ↓ to navigate <span className="mx-1">·</span> enter to open</p></div><SearchResultGroups results={results} query={query} activeIndex={activeIndex} onSelect={(result) => { saveRecentSearch(query); router.push(result.url); }} /></>
          : <div className="neo-search-empty py-12"><div className="neo-empty-icon"><Search size={23} /></div><h2>No matching work yet.</h2><p>No results match “{query.trim()}”. Try fewer terms or another filter.</p></div>}
      </section>
    </div>
  );
}
