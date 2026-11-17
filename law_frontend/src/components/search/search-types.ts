import { Brain, CheckSquare, FileText, MessageSquare, Target, type LucideIcon } from "lucide-react";

export const searchTypes = ["task", "goal", "document", "memory", "chat"] as const;
export type SearchType = (typeof searchTypes)[number];

export interface SearchResultItem {
  id: string;
  type: SearchType;
  title: string;
  subtitle?: string;
  url: string;
  score: number;
}

export const searchTypeDetails: Record<SearchType, { label: string; icon: LucideIcon }> = {
  task: { label: "Hearings & Filings", icon: CheckSquare },
  goal: { label: "Procedural Milestones", icon: Target },
  document: { label: "Pleadings & Briefs", icon: FileText },
  memory: { label: "Legal Notes & Rules", icon: Brain },
  chat: { label: "Advisory Threads", icon: MessageSquare },
};

export function groupSearchResults(results: SearchResultItem[]): Array<[SearchType, SearchResultItem[]]> {
  return searchTypes.map((type) => [type, results.filter((result) => result.type === type)]).filter((entry): entry is [SearchType, SearchResultItem[]] => entry[1].length > 0);
}
