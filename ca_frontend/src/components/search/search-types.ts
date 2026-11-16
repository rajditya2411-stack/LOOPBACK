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
  task: { label: "Tasks", icon: CheckSquare },
  goal: { label: "Goals", icon: Target },
  document: { label: "Documents", icon: FileText },
  memory: { label: "Memories", icon: Brain },
  chat: { label: "Chats", icon: MessageSquare },
};

export function groupSearchResults(results: SearchResultItem[]): Array<[SearchType, SearchResultItem[]]> {
  return searchTypes.map((type) => [type, results.filter((result) => result.type === type)]).filter((entry): entry is [SearchType, SearchResultItem[]] => entry[1].length > 0);
}
