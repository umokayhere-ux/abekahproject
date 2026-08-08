"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { cn } from "@/lib/cn";
import type { ConversationDTO, MessageDTO, Paginated, SafeUser } from "@/types";

/**
 * Two-pane inbox shared by the tenant and landlord dashboards.
 *
 * All access control lives on the server: the conversation list is filtered by
 * participation, and the message endpoints reject non-participants.
 */
export function MessagesPanel({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();

  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  const [listNonce, setListNonce] = useState(0);
  const loadConversations = useCallback(() => {
    setListNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // State updates happen inside the timer callback and after the await,
    // never synchronously in the effect body.
    const run = async () => {
      setLoadingList(true);
      setError(null);
      try {
        const data = await apiFetch<{ items: ConversationDTO[] }>(
          "/api/conversations",
        );
        if (cancelled) return;
        setConversations(data.items);
        // Open the most recent thread by default on wide screens.
        setActiveId((current) => current ?? data.items[0]?._id ?? null);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : "Could not load your messages",
        );
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };

    const timer = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listNonce]);

  const loadThread = useCallback(
    async (conversationId: string) => {
      setLoadingThread(true);
      try {
        const data = await apiFetch<Paginated<MessageDTO>>(
          `/api/conversations/${conversationId}/messages`,
        );
        setMessages(data.items);
        // Opening a thread marks it read, so refresh the unread badges.
        setConversations((current) =>
          current.map((conversation) =>
            conversation._id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
        onChanged?.();
      } catch (caught) {
        toast.error(
          caught instanceof ApiError ? caught.message : "Could not open that conversation",
        );
      } finally {
        setLoadingThread(false);
      }
    },
    [toast, onChanged],
  );

  useEffect(() => {
    if (!activeId) return;
    // Deferred to a timer so the fetch (and its state updates) happen outside
    // the effect body. `loadThread` is intentionally not a dependency: it
    // changes identity on every unread-count update, which would refetch.
    const timer = setTimeout(() => void loadThread(activeId), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeId) return;

    setSending(true);
    try {
      const { message } = await apiFetch<{ message: MessageDTO }>(
        `/api/conversations/${activeId}/messages`,
        { method: "POST", body: { text } },
      );
      setMessages((current) => [...current, message]);
      setDraft("");
      setConversations((current) =>
        current.map((conversation) =>
          conversation._id === activeId
            ? {
                ...conversation,
                lastMessage: text.slice(0, 200),
                lastMessageAt: new Date().toISOString(),
              }
            : conversation,
        ),
      );
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not send that message",
      );
    } finally {
      setSending(false);
    }
  };

  /** The participant who is not the current user. */
  const otherParty = (conversation: ConversationDTO): SafeUser | undefined =>
    conversation.participants.find(
      (participant) => participant._id !== user?._id,
    ) ?? conversation.participants[0];

  if (loadingList) return <LoadingState label="Loading messages" />;
  if (error) return <ErrorState message={error} onRetry={loadConversations} />;

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No messages yet"
        description="Conversations with landlords and tenants will appear here. Start one from any property page."
      />
    );
  }

  const activeConversation = conversations.find(
    (conversation) => conversation._id === activeId,
  );

  return (
    <div className="grid h-[calc(100vh-14rem)] min-h-[28rem] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[300px_1fr]">
      <div
        className={cn(
          "overflow-y-auto border-slate-200 lg:border-r",
          // On mobile the list hides once a thread is open.
          activeId ? "hidden lg:block" : "block",
        )}
      >
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-ink-900">
          Conversations
        </h2>
        <ul>
          {conversations.map((conversation) => {
            const other = otherParty(conversation);
            const isActive = conversation._id === activeId;
            return (
              <li key={conversation._id}>
                <button
                  type="button"
                  onClick={() => setActiveId(conversation._id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-slate-100 p-3.5 text-left transition-colors",
                    isActive ? "bg-brand-50" : "hover:bg-surface-muted",
                  )}
                >
                  <UserAvatar
                    name={other?.name ?? "User"}
                    src={other?.avatar}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {other?.name ?? "User"}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {conversation.lastMessage || "No messages yet"}
                    </p>
                  </div>
                  {(conversation.unreadCount ?? 0) > 0 && (
                    <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
                      {conversation.unreadCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cn("flex flex-col", activeId ? "flex" : "hidden lg:flex")}>
        {activeConversation ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="text-sm font-medium text-brand-700 lg:hidden"
              >
                Back
              </button>
              <UserAvatar
                name={otherParty(activeConversation)?.name ?? "User"}
                src={otherParty(activeConversation)?.avatar}
                size="sm"
              />
              <p className="font-semibold text-ink-900">
                {otherParty(activeConversation)?.name ?? "User"}
              </p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-surface-muted p-4">
              {loadingThread ? (
                <LoadingState label="Loading conversation" />
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-500">
                  No messages yet. Say hello.
                </p>
              ) : (
                messages.map((message) => {
                  const senderId =
                    typeof message.sender === "string"
                      ? message.sender
                      : message.sender._id;
                  const isMine = senderId === user?._id;
                  return (
                    <div
                      key={message._id}
                      className={cn("flex", isMine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2.5",
                          isMine
                            ? "bg-brand-600 text-white"
                            : "border border-slate-200 bg-white text-ink-900",
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                        {message.createdAt && (
                          <time
                            dateTime={message.createdAt}
                            className={cn(
                              "mt-1 block text-[11px]",
                              isMine ? "text-brand-100" : "text-ink-500",
                            )}
                          >
                            {new Date(message.createdAt).toLocaleTimeString("en-GH", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 border-t border-slate-200 p-3"
            >
              <label htmlFor="message-draft" className="sr-only">
                Write a message
              </label>
              <textarea
                id="message-draft"
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends; Shift+Enter inserts a newline.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend(event);
                  }
                }}
                placeholder="Write a message…"
                className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
              />
              <Button
                type="submit"
                loading={sending}
                disabled={draft.trim().length === 0}
                aria-label="Send message"
              >
                <Send className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-ink-500">
              Select a conversation to read it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
