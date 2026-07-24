"use client";

import { groupSearchResults, searchTypeDetails, type SearchResultItem } from "./search-types";

interface SearchResultGroupsProps {
  results: SearchResultItem[];
  activeIndex?: number;
  onSelect: (result: SearchResultItem) => void;
  query?: string;
}

function HighlightedText({ value, query }: { value: string; query: string }) {
  const cleaned = query.trim();
  if (!cleaned) return value;
  const escaped = cleaned.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  const segments = value.split(new RegExp(`(${escaped})`, "ig"));
  return <>{segments.map((segment, index) => segment.toLowerCase() === cleaned.toLowerCase() ? <mark key={index}>{segment}</mark> : segment)}</>;
}

export function SearchResultGroups({ results, activeIndex = -1, onSelect, query = "" }: SearchResultGroupsProps) {
  let resultIndex = 0;
  return <div className="neo-search-results space-y-5">
    {groupSearchResults(results).map(([type, items]) => {
      const { label, icon: Icon } = searchTypeDetails[type];
      return <section key={type} aria-labelledby={`search-group-${type}`}>
        <h2 id={`search-group-${type}`} className="flex items-center gap-2 px-2 text-label-sm text-on-surface-variant"><Icon size={15} /> {label}</h2>
        <div className="mt-2 space-y-2">
          {items.map((result) => {
            const index = resultIndex++;
            const ActiveIcon = searchTypeDetails[result.type].icon;
            return <button key={`${result.type}-${result.id}`} type="button" onClick={() => onSelect(result)} aria-current={index === activeIndex ? "true" : undefined} className={`neo-search-result flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${index === activeIndex ? "bg-surface-container-high" : "hover:bg-surface-container-low"}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low text-on-surface"><ActiveIcon size={17} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-medium text-on-surface"><HighlightedText value={result.title} query={query} /></span><span className="block truncate text-body-sm text-on-surface-variant"><HighlightedText value={result.subtitle || `Found in ${searchTypeDetails[result.type].label}`} query={query} /></span></span>
            </button>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
