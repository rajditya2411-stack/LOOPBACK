"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { api } from "@/lib/api";
import { RichMessage } from "@/components/chat/rich-message";

interface ChatThread {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

interface DocumentCitation {
  document_id?: string;
  document_title?: string;
  title?: string;
  chunk_index?: number;
  page_number?: number | null;
  relevance_score?: number;
  snippet?: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: DocumentCitation[];
}

export default function LegalAdvisoryChatPage() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { workspaces, activeWorkspace, activeWorkspaceId, fetchWorkspaces } = useWorkspaceStore();

  const [chatWorkspaceId, setChatWorkspaceId] = useState<string>("active");
  const [scopedNotesCount, setScopedNotesCount] = useState<number | null>(null);

  const effectiveWs =
    chatWorkspaceId === "all"
      ? null
      : chatWorkspaceId === "active"
      ? activeWorkspace
      : workspaces.find((w) => w.id === chatWorkspaceId) || activeWorkspace;

  const [chats, setChats] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Load document count for active workspace scope
  useEffect(() => {
    if (effectiveWs) {
      api.get<any[]>(`/documents?workspace_id=${effectiveWs.id}`)
        .then((docs) => setScopedNotesCount(Array.isArray(docs) ? docs.length : 0))
        .catch(() => setScopedNotesCount(0));
    } else {
      api.get<any[]>("/documents")
        .then((docs) => setScopedNotesCount(Array.isArray(docs) ? docs.length : 0))
        .catch(() => setScopedNotesCount(0));
    }
  }, [effectiveWs?.id]);

  // Fetch chats
  const fetchChats = async () => {
    try {
      const url = effectiveWs?.id ? `/chats?workspace_id=${effectiveWs.id}` : "/chats";
      const data = await api.get<ChatThread[]>(url);
      if (Array.isArray(data)) {
        setChats(data);
        if (data.length > 0) {
          if (!activeChatId || !data.some((c) => c.id === activeChatId)) {
            setActiveChatId(data[0].id);
            loadChatMessages(data[0].id);
          }
        } else {
          setActiveChatId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch advisory chats:", err);
    }
  };

  const loadChatMessages = async (chatId: string) => {
    try {
      const msgs = await api.get<any[]>(`/chats/${chatId}/messages`);
      if (Array.isArray(msgs)) {
        setMessages(
          msgs.map((m) => ({
            id: m.id || Math.random().toString(),
            role: m.role || "assistant",
            content: m.content || "",
            timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now",
            citations: m.citations || [],
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessages([]);
    }
  };

  useEffect(() => {
    fetchChats();
  }, [effectiveWs?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Create New Advisory Inquiry Thread
  const handleNewChat = async () => {
    try {
      const newThread = await api.post<ChatThread>("/chats", {
        title: "New Legal Advisory Inquiry",
        workspace_id: effectiveWs?.id || null,
      });
      setChats((prev) => [newThread, ...prev]);
      setActiveChatId(newThread.id);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create chat thread:", err);
    }
  };

  // Submit Prompt
  const handleSubmitPrompt = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSynthesizing) return;

    let targetChatId = activeChatId;
    if (!targetChatId) {
      try {
        const newThread = await api.post<ChatThread>("/chats", {
          title: prompt.slice(0, 40) + "...",
          workspace_id: effectiveWs?.id || null,
        });
        targetChatId = newThread.id;
        setChats((prev) => [newThread, ...prev]);
        setActiveChatId(targetChatId);
      } catch (err) {
        console.error("Failed to auto-create thread:", err);
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: Math.random().toString(),
      role: "user",
      content: prompt.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentPrompt = prompt.trim();
    setPrompt("");
    setIsSynthesizing(true);
    setStreamingContent("");

    try {
      let accumulated = "";
      for await (const event of api.stream(`/chats/${targetChatId}/messages/stream`, { content: currentPrompt })) {
        if (event.event === "token" && typeof event.data === "string") {
          accumulated += event.data;
          setStreamingContent(accumulated);
        } else if (event.event === "message_end" || event.event === "done") {
          break;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: "assistant",
          content: accumulated || "Legal synthesis generated.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setStreamingContent("");
    } catch (err) {
      console.error("Streaming error, falling back to direct message:", err);
      try {
        const resp = await api.post<any>(`/chats/${targetChatId}/messages`, { content: currentPrompt });
        setMessages((prev) => [
          ...prev,
          {
            id: resp.id || Math.random().toString(),
            role: "assistant",
            content: resp.content || "Legal advisory response generated.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            citations: resp.citations || [],
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            role: "assistant",
            content: "Consulting precedent database... Please ensure backend service is running.",
            timestamp: "Now",
          },
        ]);
      }
    } finally {
      setIsSynthesizing(false);
      setStreamingContent("");
    }
  };

  return (
    <div className="w-full px-space-lg sm:px-space-xl py-space-lg space-y-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-space-lg">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">chat</span>
              <h1 className="font-headline text-headline-md text-on-surface">
                Legal Advisory Copilot
              </h1>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Strictly grounded on-device research counsel. Evaluates case pleadings, extracts binding Supreme Court precedents, and drafts court submissions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>+ New Advisory Inquiry</span>
            </button>
          </div>
        </div>

        {/* Two-Column Chat Arena: Thread List vs Chat Canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Sub-Rail: Thread List (4 Cols) */}
          <div className="lg:col-span-4 space-y-space-md">
            <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-3">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase">
                  Scope Legal Research
                </span>
                <select
                  value={chatWorkspaceId}
                  onChange={(e) => setChatWorkspaceId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-outline-variant/30 bg-surface-container-low text-on-surface"
                >
                  <option value="active">Active Docket ({activeWorkspace?.name || "None"})</option>
                  <option value="all">All Vault Documents &amp; Precedents</option>
                  {workspaces
                    .filter((w) => w.id !== activeWorkspaceId)
                    .map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-2 rounded-lg bg-surface-container-low border border-outline-variant/20 flex items-center justify-between text-[11px]">
                <span className="text-on-surface-variant flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Grounded Notes</span>
                </span>
                <span className="font-mono-sm font-semibold text-primary">
                  {scopedNotesCount !== null ? `${scopedNotesCount} Files Indexed` : "Loading..."}
                </span>
              </div>
            </div>

            {/* Conversation Threads */}
            <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs space-y-2">
              <span className="text-[11px] font-semibold text-on-surface-variant uppercase block pb-1 border-b border-outline-variant/20">
                Inquiry Threads ({chats.length})
              </span>

              <div className="space-y-1 max-h-[460px] overflow-y-auto">
                {chats.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-6 text-center">
                    No active inquiry threads. Click + New Advisory Inquiry above.
                  </p>
                ) : (
                  chats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setActiveChatId(c.id);
                        loadChatMessages(c.id);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                        activeChatId === c.id
                          ? "bg-primary text-white"
                          : "text-on-surface hover:bg-surface-container-low"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px] shrink-0">
                        {activeChatId === c.id ? "forum" : "chat_bubble_outline"}
                      </span>
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Main Chat Canvas (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col min-h-[580px] max-h-[720px] rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-xs overflow-hidden">
            {/* Grounding Banner */}
            <div className="px-space-md py-2 border-b border-outline-variant/20 bg-surface-container-low flex items-center justify-between text-xs text-on-surface-variant">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>
                  Strict Precedent Grounding: <strong className="text-on-surface">{effectiveWs?.name || "Global Legal Vault"}</strong>
                </span>
              </div>
              <span className="font-mono-sm text-[10px] text-outline">LoopBack RAG v2.4</span>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-space-lg space-y-4">
              {messages.length === 0 && !isSynthesizing ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[24px]">gavel</span>
                  </div>
                  <div className="space-y-1 max-w-md">
                    <h3 className="font-headline text-headline-sm text-on-surface">
                      How may I assist your chambers today?
                    </h3>
                    <p className="text-xs text-on-surface-variant">
                      Inquire on procedural limitation, draft written submissions, or request binding Supreme Court precedents.
                    </p>
                  </div>

                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {[
                      "What is the limitation period for filing Written Statement in commercial suit?",
                      "Synthesize Supreme Court ratio in Vidya Drolia on tenancy arbitrability",
                      "Draft preliminary objections under Order VII Rule 11 CPC",
                      "How does Section 18 Limitation Act renew debt limitation?",
                    ].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPrompt(s)}
                        className="px-2.5 py-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container text-xs text-on-surface transition-colors cursor-pointer text-left"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-outline mb-1 font-mono-sm">
                      <span>{m.role === "user" ? user?.full_name || "Counsel" : "Legal Advisory Copilot"}</span>
                      <span>·</span>
                      <span>{m.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-xl p-3.5 text-xs leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-white"
                          : "bg-surface-container-low border border-outline-variant/30 text-on-surface"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <RichMessage content={m.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Streaming bubble */}
              {isSynthesizing && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-1.5 text-[10px] text-outline mb-1 font-mono-sm">
                    <span>Legal Advisory Copilot</span>
                    <span>·</span>
                    <span>Synthesizing...</span>
                  </div>
                  <div className="max-w-[85%] rounded-xl p-3.5 text-xs bg-surface-container-low border border-outline-variant/30 text-on-surface">
                    <RichMessage content={streamingContent || "Consulting precedent database & pleadings..."} isStreaming={true} />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmitPrompt} className="p-3 border-t border-outline-variant/20 bg-surface-container-lowest flex items-center gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask procedural questions, verify limitation, or draft grounds of appeal..."
                className="flex-1 px-3.5 py-2 text-xs rounded-lg border border-outline-variant/30 bg-surface-container-low focus:bg-surface-container-lowest focus:border-primary focus:outline-none"
                disabled={isSynthesizing}
              />
              <button
                type="submit"
                disabled={isSynthesizing || !prompt.trim()}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>{isSynthesizing ? "Synthesizing..." : "Send Prompt"}</span>
                <span className="material-symbols-outlined text-[15px]">send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
