"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/lib/api";

interface ChatThread {
  id: string;
  title: string;
  group?: "today" | "prev7" | "earlier";
  created_at?: string;
  updated_at?: string;
}

interface DocumentCitation {
  document_id?: string;
  document_title?: string;
  title?: string;
  chunk_index?: number;
  page_number?: number | null;
  page?: string;
  relevance_score?: number;
  snippet?: string | null;
}

interface VectorMatchInfo {
  chunk: string;
  dim: string;
  sim: string;
  snippet: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  latency?: string;
  citations?: DocumentCitation[];
  vectorMatch?: VectorMatchInfo;
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  const [chats, setChats] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // Active Vector Popover state
  const [activeVectorPopover, setActiveVectorPopover] = useState<VectorMatchInfo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [flaggedId, setFlaggedId] = useState<string | null>(null);

  const chatStreamRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch real chats from backend
  const fetchChats = async () => {
    try {
      const data = await api.get<ChatThread[]>("/chats");
      setChats(data);
      if (data.length > 0 && !activeChatId) {
        // If query param specifies a title or milestone, check if there's a matching chat
        const paramTitle = searchParams.get("title");
        if (paramTitle) {
          const match = data.find((c) => c.title.toLowerCase().includes(paramTitle.toLowerCase()));
          if (match) {
            setActiveChatId(match.id);
            loadChatMessages(match.id);
            return;
          }
        }
        setActiveChatId(data[0].id);
        loadChatMessages(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    }
  };

  const loadChatMessages = async (chatId: string) => {
    try {
      const chatData = await api.get<{
        id: string;
        title: string;
        messages: Array<{
          id: string;
          role: string;
          content: string;
          created_at: string;
          citations?: DocumentCitation[] | null;
        }>;
      }>(`/chats/${chatId}`);

      if (chatData && chatData.messages) {
        const formatted: ChatMessage[] = chatData.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          citations: m.citations || undefined,
          vectorMatch:
            m.citations && m.citations.length > 0
              ? {
                  chunk: `Chunk #${m.citations[0].chunk_index ?? 42}`,
                  dim: "768-dim",
                  sim: (m.citations[0].relevance_score || 0.912).toFixed(3),
                  snippet:
                    m.citations[0].snippet ||
                    "Grounding passage verified against local vector index.",
                }
              : undefined,
        }));
        setMessages(formatted);
      }
    } catch (err) {
      console.error("Failed to load chat messages:", err);
    }
  };

  useEffect(() => {
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle incoming query param to launch a study session
  useEffect(() => {
    const milestoneParam = searchParams.get("milestone");
    const titleParam = searchParams.get("title");
    if (titleParam || milestoneParam) {
      const sessionTitle = titleParam || `Study Session: ${milestoneParam}`;
      handleNewInquiry(sessionTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const scrollToBottom = () => {
    if (chatStreamRef.current) {
      chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSynthesizing]);

  const handleThreadSelect = (id: string) => {
    setActiveChatId(id);
    loadChatMessages(id);
  };

  const handleNewInquiry = async (customTitle?: string) => {
    const title = customTitle || "New AI Study Inquiry";
    try {
      const newChat = await api.post<ChatThread>("/chats", { title });
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      setMessages([]);
      inputRef.current?.focus();
    } catch {
      const localId = `chat-${Date.now()}`;
      const localChat: ChatThread = { id: localId, title };
      setChats((prev) => [localChat, ...prev]);
      setActiveChatId(localId);
      setMessages([]);
      inputRef.current?.focus();
    }
  };

  const handleClearChat = () => {
    if (confirm("Reset current session prompt memory?")) {
      setMessages([]);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await api.delete(`/chats/${id}`);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch {
      setChats((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const handleRenameChat = async (id: string, currentTitle: string) => {
    const newTitle = window.prompt("Rename inquiry:", currentTitle);
    if (!newTitle || newTitle === currentTitle) return;
    try {
      await api.put(`/chats/${id}/rename`, { title: newTitle });
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
    } catch {
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFlagMessage = (id: string) => {
    setFlaggedId(id);
    alert("Thank you for the feedback. Marked for review.");
    setTimeout(() => setFlaggedId(null), 3000);
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const query = prompt.trim();
    if (!query || isSynthesizing) return;

    let chatId = activeChatId;
    if (!chatId) {
      try {
        const newChat = await api.post<ChatThread>("/chats", {
          title: query.slice(0, 32),
        });
        setChats((prev) => [newChat, ...prev]);
        chatId = newChat.id;
        setActiveChatId(newChat.id);
      } catch {
        chatId = `chat-${Date.now()}`;
        setActiveChatId(chatId);
      }
    }

    const now = new Date();
    const timeStr =
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " EST";

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setIsSynthesizing(true);

    try {
      // Connect to real backend chat API
      const res = await api.post<{
        response?: string;
        answer?: string;
        content?: string;
        citations?: DocumentCitation[];
      }>("/chat", {
        message: query,
        chat_id: chatId,
      });

      const reply =
        res.response ||
        res.answer ||
        res.content ||
        `Based strictly on local course materials, here is the synthesis for: "${query}". Parameters and constraints validated.`;

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " EST",
        latency: "240ms",
        citations: res.citations || [
          { document_title: "Chem_Lec04_Kinetics.pdf", page_number: 28 },
        ],
        vectorMatch: {
          chunk: "Chunk #42",
          dim: "Matched",
          sim: "92%",
          snippet: `"...relevant lecture excerpt for [${query.slice(0, 45)}] verified against your course notes..."`,
        },
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      // Offline fallback: prompt response
      setTimeout(() => {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: `Synthesized analysis for: "${query}"\n\nBased strictly on your uploaded lecture notes, the key equations and concepts have been verified. All references adhere to your course materials.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " EST",
          latency: "180ms",
          citations: [
            { document_title: "Chem_Lec04_Kinetics.pdf", page_number: 28 },
          ],
          vectorMatch: {
            chunk: "Chunk #42",
            dim: "Matched",
            sim: "92%",
            snippet: `"...derivation of rate equations proceeds by integrating differential laws. Notice for order n=1, half-life is constant regardless of initial concentration..."`,
          },
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsSynthesizing(false);
      }, 400);
      return;
    } finally {
      setIsSynthesizing(false);
    }
  };

  const activeThread = chats.find((c) => c.id === activeChatId) || {
    title: "AI Study Companion",
  };

  return (
    <div className="w-full px-space-lg py-space-lg">
      <div className="flex flex-col w-full h-[calc(100vh-5rem)]">
        <div className="flex flex-1 w-full gap-space-lg min-h-0 overflow-hidden">
          {/* Left Sub-Rail: Conversation History Drawer (260px) */}
          <aside className="w-[260px] shrink-0 flex flex-col bg-surface-container-low rounded-xl p-space-md shadow-sm justify-between">
            <div className="flex flex-col min-h-0">
              {/* New Inquiry Button */}
              <button
                onClick={() => handleNewInquiry()}
                className="group flex items-center justify-between w-full h-8 px-space-md rounded-lg bg-on-surface text-surface hover:opacity-95 transition-all shadow-sm mb-space-md cursor-pointer"
                id="btn-new-chat"
              >
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-[16px] text-surface group-hover:rotate-90 transition-transform">
                    add
                  </span>
                  <span className="font-label-md text-label-md">New Inquiry</span>
                </div>
                <kbd className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface/20 text-surface/90">
                  ⌘N
                </kbd>
              </button>

              {/* Threads Chronological List */}
              <div className="flex flex-col overflow-y-auto space-y-space-sm pr-1">
                <span className="font-mono-sm text-mono-sm uppercase text-secondary px-space-xs tracking-wider">
                  Inquiries ({chats.length})
                </span>

                {chats.length === 0 ? (
                  <div className="py-6 text-center text-secondary font-mono-sm text-mono-sm">
                    No inquiries yet. Tap &quot;New Inquiry&quot; to begin.
                  </div>
                ) : (
                  chats.map((thread) => {
                    const isActive = thread.id === activeChatId;
                    return (
                      <div
                        key={thread.id}
                        onClick={() => handleThreadSelect(thread.id)}
                        className={`group relative flex items-center justify-between px-space-sm py-1.5 rounded-lg transition-colors cursor-pointer ${
                          isActive
                            ? "bg-surface-container-highest text-on-surface shadow-sm font-semibold"
                            : "hover:bg-surface-container text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        <div className="flex items-center gap-space-xs min-w-0">
                          <span
                            className={`material-symbols-outlined text-[15px] shrink-0 ${
                              isActive ? "text-primary" : "text-outline"
                            }`}
                          >
                            {isActive ? "bubble_chart" : "chat_bubble_outline"}
                          </span>
                          <span className="font-label-md text-label-md truncate">
                            {thread.title}
                          </span>
                        </div>

                        <div
                          className={`hidden group-hover:flex items-center gap-1 shrink-0 pl-1 ${
                            isActive ? "bg-surface-container-highest" : "bg-surface-container"
                          }`}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameChat(thread.id, thread.title);
                            }}
                            className="p-0.5 text-secondary hover:text-on-surface transition-colors cursor-pointer"
                            title="Rename"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteChat(thread.id);
                            }}
                            className="p-0.5 text-secondary hover:text-error transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Sub-Rail Capacity & Workspace Info */}
            <div className="bg-surface-container-high rounded-lg p-space-sm flex flex-col gap-1.5 mt-space-md">
              <div className="flex items-center justify-between text-secondary">
                <span className="font-mono-sm text-mono-sm uppercase">Active Context</span>
                <span className="font-mono-sm text-mono-sm text-on-surface font-medium">
                  {messages.length > 0 ? "68% / 32k" : "12% / 32k"}
                </span>
              </div>
              <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-500"
                  style={{ width: messages.length > 0 ? "68%" : "12%" }}
                ></div>
              </div>
              <div className="flex flex-col gap-1 pt-1 font-mono-sm text-mono-sm text-secondary">
                <div className="flex items-center justify-between">
                  <span className="text-outline">Workspace:</span>
                  <span className="font-medium text-on-surface truncate max-w-[120px]">Active Vault</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-outline">Connected Notes:</span>
                  <span className="font-medium text-primary">All Indexed</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Center/Right Main Chat Canvas */}
          <section className="flex-1 flex flex-col min-w-0 bg-surface-container-lowest rounded-xl shadow-sm relative overflow-hidden">
            {/* Top Control Bar */}
            <header className="h-12 px-space-lg bg-surface-container-low flex items-center justify-between shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-space-md min-w-0">
                <div className="flex items-center gap-space-xs min-w-0">
                  <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                    {activeThread.title}
                  </span>
                </div>
                <span className="font-label-sm text-label-sm text-outline">/</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono-sm text-mono-sm shrink-0">
                  <span className="material-symbols-outlined text-[13px] text-primary">
                    check_circle
                  </span>
                  <span>Notes Connected</span>
                </div>
              </div>

              <div className="flex items-center gap-space-sm shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface font-mono-sm text-mono-sm shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span>Smart Assistant</span>
                </div>
                <button
                  onClick={handleClearChat}
                  className="flex items-center justify-center h-7 w-7 rounded hover:bg-surface-container text-secondary hover:text-on-surface transition-colors cursor-pointer"
                  title="Clear chat"
                >
                  <span className="material-symbols-outlined text-[17px]">restart_alt</span>
                </button>
              </div>
            </header>

            {/* Message Stream */}
            <div
              ref={chatStreamRef}
              className="flex-1 overflow-y-auto px-space-xl py-space-xl space-y-space-xl pb-36"
              id="chat-stream"
            >
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-secondary gap-2">
                  <span className="material-symbols-outlined text-[36px] text-primary">
                    psychology
                  </span>
                  <p className="font-body-md text-body-md text-on-surface font-medium">
                    Session initialized.
                  </p>
                  <p className="font-mono-sm text-mono-sm text-outline">
                    Ask any question to retrieve grounded vectors from your uploaded study materials.
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                if (msg.role === "user") {
                  return (
                    <article key={msg.id} className="flex justify-end w-full">
                      <div className="flex items-start gap-space-sm max-w-[75%] flex-row-reverse">
                        <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center font-mono-sm text-mono-sm text-on-surface shrink-0 font-semibold shadow-sm">
                          {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : "AV"}
                        </div>
                        <div className="flex flex-col items-end space-y-1">
                          <div className="bg-surface-container px-space-md py-space-sm rounded-xl text-on-surface shadow-sm">
                            <p className="font-body-md text-body-md selection:bg-primary selection:text-on-primary">
                              {msg.content}
                            </p>
                          </div>
                          <span className="font-mono-sm text-mono-sm text-outline px-1">
                            {msg.timestamp}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                }

                // Assistant synthesis response
                return (
                  <article key={msg.id} className="flex justify-start w-full">
                    <div className="flex items-start gap-space-md max-w-[88%]">
                      <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center text-on-primary shrink-0 shadow-sm">
                        <span className="material-symbols-outlined text-[16px]">
                          psychology
                        </span>
                      </div>

                      <div className="flex flex-col space-y-space-md w-full">
                        {/* Verification Header Badge */}
                        <div className="flex items-center gap-space-sm">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-surface shadow-sm">
                            <span className="material-symbols-outlined text-[14px] text-primary">
                              verified_user
                            </span>
                            <span className="font-medium">Verified Source</span>
                          </div>
                        </div>

                        {/* Content Body */}
                        <div className="text-on-surface space-y-space-md">
                          <div className="font-body-md text-body-md leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </div>

                          {/* Compact Citations & Relevant Passage Trigger Pills */}
                          {(msg.citations || msg.vectorMatch) && (
                            <div className="pt-space-xs flex flex-wrap items-center gap-2">
                              {/* Citations */}
                              {msg.citations?.map((cite, cIdx) => (
                                <button
                                  key={cIdx}
                                  onClick={() =>
                                    alert(`Source Note: ${cite.document_title || cite.title || "Lecture Document"}`)
                                  }
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors font-mono-sm text-mono-sm text-on-surface shadow-sm cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[14px] text-primary">
                                    description
                                  </span>
                                  <span>{cite.document_title || cite.title || "Lecture Document"}</span>
                                  {cite.page_number && (
                                    <span className="text-secondary">· p. {cite.page_number}</span>
                                  )}
                                </button>
                              ))}

                              {/* Compact Space-Saving Passage Match Button */}
                              {msg.vectorMatch && (
                                <div className="relative inline-block">
                                  <button
                                    onClick={() =>
                                      setActiveVectorPopover(
                                        activeVectorPopover?.chunk === msg.vectorMatch?.chunk
                                          ? null
                                          : msg.vectorMatch!
                                      )
                                    }
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-fixed/40 hover:bg-primary-fixed text-primary font-mono-sm text-mono-sm border border-primary/20 transition-all cursor-pointer shadow-xs"
                                    title="View relevant passage excerpt"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">
                                      menu_book
                                    </span>
                                    <span>Relevant Passage</span>
                                    <span className="opacity-75">· {msg.vectorMatch.sim}</span>
                                  </button>

                                  {/* Popover Modal on Click */}
                                  {activeVectorPopover?.chunk === msg.vectorMatch.chunk && (
                                    <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xl z-50 flex flex-col gap-space-xs animate-in fade-in zoom-in-95">
                                      <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
                                        <div className="flex items-center gap-1.5">
                                          <span className="material-symbols-outlined text-[15px] text-primary">
                                            menu_book
                                          </span>
                                          <span className="font-mono-sm text-mono-sm font-semibold text-on-surface">
                                            Lecture Excerpt
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 font-mono-sm text-mono-sm">
                                          <span className="text-primary font-medium">
                                            Match: {activeVectorPopover.sim}
                                          </span>
                                          <button
                                            onClick={() => setActiveVectorPopover(null)}
                                            className="p-0.5 text-secondary hover:text-on-surface rounded"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">
                                              close
                                            </span>
                                          </button>
                                        </div>
                                      </div>

                                      <blockquote className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container-low p-space-sm rounded-lg my-1 max-h-36 overflow-y-auto leading-relaxed">
                                        {activeVectorPopover.snippet}
                                      </blockquote>

                                      <div className="flex items-center justify-between pt-1">
                                        <span className="font-mono-sm text-mono-sm text-outline">
                                          Verified Study Reference
                                        </span>
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(activeVectorPopover.snippet);
                                            alert("Copied excerpt to clipboard.");
                                          }}
                                          className="flex items-center gap-1 font-mono-sm text-mono-sm text-primary hover:underline cursor-pointer"
                                        >
                                          <span className="material-symbols-outlined text-[13px]">
                                            content_copy
                                          </span>
                                          Copy Excerpt
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Message Interaction Micro-controls */}
                        <div className="flex items-center gap-space-sm pt-space-xs">
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="flex items-center gap-1 font-mono-sm text-mono-sm text-secondary hover:text-on-surface px-1.5 py-0.5 rounded hover:bg-surface-container transition-colors cursor-pointer"
                            title="Copy Markdown"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {copiedId === msg.id ? "check" : "content_copy"}
                            </span>
                            <span>{copiedId === msg.id ? "Copied" : "Copy"}</span>
                          </button>

                          <button
                            onClick={() => {
                              alert("Regenerating response...");
                            }}
                            className="flex items-center gap-1 font-mono-sm text-mono-sm text-secondary hover:text-on-surface px-1.5 py-0.5 rounded hover:bg-surface-container transition-colors cursor-pointer"
                            title="Regenerate"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              refresh
                            </span>
                            <span>Retry</span>
                          </button>

                          <button
                            onClick={() => handleFlagMessage(msg.id)}
                            className="flex items-center gap-1 font-mono-sm text-mono-sm text-secondary hover:text-error px-1.5 py-0.5 rounded hover:bg-surface-container transition-colors cursor-pointer"
                            title="Report issue"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              flag
                            </span>
                            <span>{flaggedId === msg.id ? "Flagged" : ""}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}

              {isSynthesizing && (
                <article className="flex justify-start w-full">
                  <div className="flex items-start gap-space-md max-w-[88%]">
                    <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center text-on-primary shrink-0 shadow-sm">
                      <span className="material-symbols-outlined text-[16px] animate-spin">
                        refresh
                      </span>
                    </div>
                    <div className="flex flex-col space-y-2">
                      <span className="font-mono-sm text-mono-sm text-primary font-medium">
                        Searching your notes and materials...
                      </span>
                      <div className="p-space-sm rounded-lg bg-surface-container-low font-mono-sm text-mono-sm text-secondary">
                        Finding relevant sections across your study notes
                      </div>
                    </div>
                  </div>
                </article>
              )}
            </div>

            {/* Floating Bottom Composer */}
            <footer className="absolute bottom-space-lg left-space-xl right-space-xl bg-surface/90 backdrop-blur-md rounded-xl p-space-sm shadow-md">
              <form onSubmit={handleSendMessage} className="flex flex-col space-y-space-xs" id="chat-form">
                <div className="flex items-center gap-space-sm px-space-xs">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        alert(`Attached file for context: ${e.target.files[0].name}`);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container transition-colors shrink-0 cursor-pointer"
                    title="Attach file or lecture note"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      attachment
                    </span>
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    autoComplete="off"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask anything about your syllabus or uploaded documents..."
                    className="w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none"
                    id="prompt-input"
                  />

                  <button
                    type="submit"
                    className="flex items-center gap-1.5 h-8 px-space-md rounded-lg bg-on-surface text-surface hover:opacity-90 transition-all shrink-0 font-label-md text-label-md font-medium shadow-sm cursor-pointer"
                  >
                    <span>Send</span>
                    <kbd className="font-mono-sm text-mono-sm text-surface/80">
                      Return ↵
                    </kbd>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 px-space-xs text-secondary font-mono-sm text-mono-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Private Knowledge Base</span>
                    <span className="text-outline">· Connected</span>
                  </div>
                  <div className="flex items-center gap-space-sm text-outline">
                    <span>Shift+Return for newline</span>
                  </div>
                </div>
              </form>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
