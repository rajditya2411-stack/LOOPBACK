"use client";

import { useState, useEffect, useRef } from "react";
import { api, ApiRequestError } from "@/lib/api";
import Link from "next/link";
import { ArrowDown, FileText, PanelLeft, Pencil, Plus, Send, MessageSquare, Sparkles, Trash2, X } from "lucide-react";
import { RichMessage } from "@/components/chat/rich-message";
import { useUIStore } from "@/store/ui-store";
import { motion, useReducedMotion } from "framer-motion";
import { AiOrb } from "@/components/ai-orb";

interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  citations?: DocumentCitation[] | null;
}

interface DocumentCitation {
  document_id: string;
  document_title: string;
  chunk_index: number;
  page_number: number | null;
  relevance_score: number;
  snippet?: string | null;
}

const ACTIVE_CHAT_STORAGE_KEY = "loopback.active_chat_id";
const STARTER_PROMPTS = [
  "What should I focus on today?",
  "Summarize my current priorities.",
  "Turn my open work into a clear next step.",
];

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const reduceMotion = useReducedMotion();

  const fetchChats = async () => {
    try {
      const data = await api.get<Chat[]>("/chats");
      setChats(data);
    } catch (err) {
      console.error(err);
      setError("Could not reach the backend to load conversations. Check that LoopBack is running.");
    }
  };

  const loadChat = async (chatId: string) => {
    try {
      const data = await api.get<{ messages: Message[] }>(`/chats/${chatId}`);
      setMessages(data.messages);
      setActiveChatId(chatId);
      localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, chatId);
    } catch (err) {
      console.error(err);
      setError("Could not load this conversation. Check the backend connection and try again.");
    }
  };

  const createChat = async () => {
    try {
      const data = await api.post<Chat>("/chats", { title: "New Chat" });
      setChats([data, ...chats]);
      setActiveChatId(data.id);
      setMessages([]);
      localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, data.id);
    } catch (err) {
      console.error(err);
      setError("Could not create a conversation. Check that the backend is available and try again.");
    }
  };

  useEffect(() => {
    const restoreChat = async () => {
      try {
        const data = await api.get<Chat[]>("/chats");
        setChats(data);
        const storedId = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
        if (storedId && data.some((chat) => chat.id === storedId)) {
          await loadChat(storedId);
        }
      } catch (err) {
        console.error(err);
        setError("Could not load conversations. Check that LoopBack is running.");
      } finally {
        setIsLoadingChats(false);
      }
    };
    void restoreChat();
  }, []);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport || !isNearBottomRef.current) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: isLoading || reduceMotion ? "auto" : "smooth" });
  }, [isLoading, messages, reduceMotion]);

  const handleMessageScroll = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
    isNearBottomRef.current = isNearBottom;
    setShowJumpToLatest(!isNearBottom && messages.length > 0);
  };

  const jumpToLatest = () => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    isNearBottomRef.current = true;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  };

  const handleSubmit = async (e?: React.FormEvent, retryMessage?: string) => {
    if (e) e.preventDefault();
    const messageToSend = retryMessage || input;
    if (!messageToSend.trim() || isLoading) return;

    setError(null);
    let targetChatId = activeChatId;
    if (!targetChatId) {
      try {
        const newChat = await api.post<Chat>("/chats", { title: messageToSend.substring(0, 30) });
        setChats([newChat, ...chats]);
        targetChatId = newChat.id;
        setActiveChatId(targetChatId);
      } catch {
        setError("Failed to create chat. Please try again.");
        return;
      }
    }

    const userMessage = { id: Date.now().toString(), role: "user", content: messageToSend };
    if (!retryMessage) {
        setMessages(prev => [...prev, userMessage]);
        setInput("");
    }
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: tempId, role: "assistant", content: "" }]);

    try {
      let streamError: string | null = null;
      for await (const event of api.stream(
        `/chats/${targetChatId}/messages/stream`,
        { content: userMessage.content, retry: Boolean(retryMessage) },
        { signal: controller.signal },
      )) {
        if (event.event === "sources" && Array.isArray(event.data)) {
          setMessages((current) => current.map((message) => (
            message.id === tempId ? { ...message, citations: event.data as DocumentCitation[] } : message
          )));
        }
        if (event.event === "token" && typeof event.data === "object" && event.data !== null && "content" in event.data) {
          const content = (event.data as { content: unknown }).content;
          if (typeof content === "string") {
            setMessages((current) => current.map((message) => (
              message.id === tempId ? { ...message, content: message.content + content } : message
            )));
          }
        }
        if (event.event === "error" && typeof event.data === "object" && event.data !== null && "message" in event.data) {
          const message = (event.data as { message: unknown }).message;
          streamError = typeof message === "string" ? message : "Failed to receive a complete AI response.";
        }
      }
      if (streamError) throw new Error(streamError);

    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(null);
      } else {
        console.error(err);
        if (err instanceof ApiRequestError && err.status === 503) {
          setError("AI is not configured on the backend. Configure the selected provider and try again.");
        } else if (err instanceof ApiRequestError && err.status >= 500) {
          setError("The backend could not complete the AI request. Please verify the service and retry.");
        } else {
          setError(err instanceof Error ? err.message : "Failed to receive response from AI. Please try again.");
        }
      }
      setMessages((current) => current.filter((message) => message.id !== tempId || Boolean(message.content)));
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      fetchChats(); // Refresh chat list titles
    }
  };

  const cancelStream = () => {
    abortControllerRef.current?.abort();
  };

  const selectStarterPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const renameChat = async (chat: Chat) => {
    const title = window.prompt("Rename chat", chat.title);
    if (title === null || title.trim() === chat.title) return;
    try {
      const updated = await api.put<Chat>(`/chats/${chat.id}`, { title: title.trim() });
      setChats((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      setError("Could not rename this chat.");
    }
  };

  const deleteChat = async (chat: Chat) => {
    if (!window.confirm(`Delete \"${chat.title}\"? This cannot be undone.`)) return;
    try {
      await api.delete(`/chats/${chat.id}`);
      const remaining = chats.filter((item) => item.id !== chat.id);
      setChats(remaining);
      if (activeChatId === chat.id) {
        setActiveChatId(null);
        setMessages([]);
        localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
      }
    } catch {
      setError("Could not delete this chat.");
    }
  };

  return (
    <div className="neo-chat -mx-6 -my-6 flex h-[calc(100vh-60px)] w-[calc(100%+3rem)] overflow-hidden rounded-[28px] border border-outline-variant/70 bg-surface-container-lowest/50 shadow-2xl shadow-black/10 backdrop-blur-xl md:h-screen">
      <div className="neo-chat-sidebar hidden w-72 flex-col border-r border-outline-variant/70 bg-surface-container-lowest/70 md:flex">
        <div className="p-4 border-b border-outline-variant">
          <button
            onClick={createChat}
            className="neo-new-chat flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-lg shadow-primary/10 transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {chats.map(chat => (
            <div key={chat.id} className={`neo-chat-history-item group flex items-center rounded-xl transition-all ${activeChatId === chat.id ? "bg-primary-container text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"}`}>
              <button
                onClick={() => loadChat(chat.id)}
                aria-current={activeChatId === chat.id ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
              >
                <MessageSquare size={16} className="shrink-0" aria-hidden="true" />
                <span className="truncate text-sm font-medium">{chat.title}</span>
              </button>
              <div className="mr-1 hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
                <button type="button" onClick={() => void renameChat(chat)} className="rounded p-1 hover:bg-surface-container-highest" aria-label={`Rename ${chat.title}`} title="Rename chat"><Pencil size={14} /></button>
                <button type="button" onClick={() => void deleteChat(chat)} className="rounded p-1 hover:bg-error-container hover:text-on-error-container" aria-label={`Delete ${chat.title}`} title="Delete chat"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {isLoadingChats ? (
            <div className="p-4 text-center text-sm text-on-surface-variant">Loading conversations...</div>
          ) : chats.length === 0 && (
            <div className="p-4 text-center text-sm text-on-surface-variant">
              No chats yet
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex min-w-0 flex-col">
        <header className="neo-chat-topbar flex items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => useUIStore.getState().toggleSidebar()} className="neo-mobile-sidebar-button md:hidden" aria-label="Open navigation"><PanelLeft size={18} /></button><div className="min-w-0"><p className="neo-eyebrow">AI workspace</p><p className="truncate text-body-sm font-semibold text-on-surface">{chats.find((chat) => chat.id === activeChatId)?.title ?? "New conversation"}</p></div></div>
          <button type="button" onClick={createChat} className="neo-topbar-new-chat md:hidden"><Plus size={16} /> New</button>
        </header>

        {/* Messages */}
        <div ref={messageViewportRef} onScroll={handleMessageScroll} className="neo-message-canvas relative flex-1 space-y-6 overflow-y-auto p-4 md:p-6 lg:px-10" aria-live="polite" aria-busy={isLoading}>
          {messages.length === 0 ? (
            <div className="neo-chat-empty h-full flex flex-col items-center justify-center text-on-surface-variant">
              <AiOrb className="mb-5 scale-125" />
              <div className="text-center">
                <p className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 text-label-sm"><Sparkles size={13} /> Workspace-aware AI</p>
                <h2 className="mt-4 text-headline-lg font-medium text-on-surface">Think out loud. LoopBack keeps the thread.</h2>
                <p className="mx-auto mt-2 max-w-xl text-body-md">Ask about documents, active goals, decisions, or the next meaningful action.</p>
              </div>
              <div className="mt-7 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
                {STARTER_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => selectStarterPrompt(prompt)} className="interactive-card rounded-2xl border border-outline-variant bg-surface-container-low p-4 text-left text-body-sm text-on-surface-variant hover:text-on-surface">{prompt}</button>)}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-4">
              {messages.map((msg, i) => (
                <motion.div key={msg.id || i} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }} className={`neo-message-row flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div 
                    className={`neo-message max-w-[90%] md:max-w-[85%] rounded-2xl px-5 py-3.5 ${
                      msg.role === "user" 
                        ? "bg-primary text-on-primary rounded-tr-sm shadow-lg shadow-primary/10"
                        : "premium-card text-on-surface rounded-tl-sm"
                    }`}
                  >
                    {msg.content ? <RichMessage content={msg.content} isStreaming={msg.role === "assistant" && isLoading && i === messages.length - 1} /> : msg.role === "assistant" && isLoading ? <div className="neo-thinking" aria-label="LoopBack is thinking"><span /><span /><span /></div> : null}
                    {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                      <div className="neo-sources mt-4 border-t border-outline-variant pt-3">
                        <p className="text-label-sm text-on-surface-variant">Sources</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.citations.map((citation) => (
                            <div key={`${citation.document_id}-${citation.chunk_index}`} className="max-w-full">
                            <Link
                              href={`/documents/${citation.document_id}`}
                              className="inline-flex max-w-full items-center gap-1 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-container"
                              title={`Open ${citation.document_title}${citation.page_number ? `, page ${citation.page_number}` : ""}`}
                            >
                              <FileText size={13} className="shrink-0" aria-hidden="true" />
                              <span className="truncate">{citation.document_title}{citation.page_number ? ` · p. ${citation.page_number}` : ""}</span>
                            </Link>
                            {citation.snippet && <p className="mt-1 max-w-xs text-xs leading-relaxed text-on-surface-variant">{citation.snippet}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          {showJumpToLatest && <button type="button" onClick={jumpToLatest} className="neo-jump-latest"><ArrowDown size={16} /> Latest</button>}
          
          {error && (
            <div className="max-w-3xl mx-auto mb-4 p-4 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-between">
               <span className="text-body-md text-red-500">{error}</span>
               <button 
                  onClick={() => {
                     const lastUserMessage = messages.findLast(m => m.role === 'user');
                     if (lastUserMessage) handleSubmit(undefined, lastUserMessage.content);
                  }}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-colors"
               >
                  Retry
               </button>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="neo-composer-wrap border-t border-outline-variant/60 bg-surface-container-lowest/70 p-4 pb-6 backdrop-blur-xl md:pb-4">
          <div className="max-w-3xl mx-auto relative">
            <form onSubmit={handleSubmit} className="neo-composer relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }}
                placeholder="Message LoopBack..."
                aria-label="Message LoopBack..."
                disabled={isLoading}
                rows={1}
                className="w-full resize-none rounded-2xl border border-outline-variant bg-surface-container-lowest py-3.5 pl-5 pr-14 text-body-md text-on-surface shadow-xl shadow-black/5 transition-all placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type={isLoading ? "button" : "submit"}
                onClick={isLoading ? cancelStream : undefined}
                aria-label={isLoading ? "Stop generating" : "Send message"}
                title={isLoading ? "Stop generating" : "Send message"}
                disabled={!isLoading && !input.trim()}
                className="neo-send-button absolute top-2.5 right-2.5 bottom-2.5 flex w-10 items-center justify-center rounded-lg bg-primary text-on-primary disabled:bg-surface-container-high disabled:text-on-surface-variant transition-colors"
              >
                {isLoading ? <X size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" className={input.trim() ? "ml-0.5" : ""} />}
              </button>
            </form>
            <div className="text-center mt-2">
              <span className="neo-composer-note text-[11px] text-on-surface-variant/70 font-medium">
                Press Enter to send <span aria-hidden="true">·</span> Shift + Enter for a new line
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
