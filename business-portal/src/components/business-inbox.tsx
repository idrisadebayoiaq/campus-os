"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  conversationTitle,
  loadBusinessConversations,
  type BizConversation,
} from "@/lib/messaging";
import { initialsFromName } from "@/lib/nav";

type MessageRow = {
  id: string;
  body: string;
  sender_id: string | null;
  created_at: string;
  message_type?: string | null;
};

const KIND_LABEL: Record<string, string> = { listing: "Housing", order: "Order" };

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function listTime(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
    </svg>
  );
}

export function BusinessInbox({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [conversations, setConversations] = useState<BizConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const supabase = createClient();
    const rows = await loadBusinessConversations(supabase, userId);
    setConversations(rows);
    if (!activeId && rows[0]) setActiveId(rows[0].id);
    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("id, body, sender_id, created_at, message_type")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setMessages((data as MessageRow[]) || []);
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread: false } : c)),
    );
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const supabase = createClient();
    const channel = supabase
      .channel(`biz-inbox-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations
      .filter((c) => filter === "all" || (filter === "unread" ? c.unread : c.kind === filter))
      .filter((c) => !q || `${conversationTitle(c)} ${c.lastMessage ?? ""}`.toLowerCase().includes(q));
  }, [conversations, filter, search]);

  const active = conversations.find((c) => c.id === activeId) || null;

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim()) return;
    setSending(true);
    const supabase = createClient();
    const body = draft.trim();
    setDraft("");
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: activeId,
        sender_id: userId,
        body,
        message_type: "text",
      })
      .select("id, body, sender_id, created_at, message_type")
      .single();
    setSending(false);
    if (error) {
      setDraft(body);
      return;
    }
    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as MessageRow]));
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, lastMessage: body, updated_at: data.created_at } : c)),
      );
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="grid h-[75vh] min-h-[32rem] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section
          className={`min-h-0 border-r border-border ${mobileShowChat ? "hidden lg:flex" : "flex"} flex-col`}
        >
          <div className="space-y-2 border-b border-border p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats"
              className="h-10 w-full rounded-full bg-surface px-4 text-sm outline-none"
            />
            <div className="flex gap-1">
              {[
                ["all", "All"],
                ["unread", "Unread"],
                ["listing", "Housing"],
                ["order", "Orders"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    filter === key ? "bg-fg text-bg" : "bg-surface text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted">
                {search || filter !== "all" ? "No matching chats." : "No messages yet."}
              </p>
            ) : (
              filtered.map((chat) => {
                const title = conversationTitle(chat);
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => {
                      setActiveId(chat.id);
                      setMobileShowChat(true);
                    }}
                    className={`flex w-full items-center gap-3 px-3 text-left hover:bg-surface ${
                      chat.id === activeId ? "bg-surface" : ""
                    }`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-bold">
                      {initialsFromName(title)}
                    </span>
                    <span className="min-w-0 flex-1 border-b border-border py-3">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[15px] font-semibold">{title}</span>
                        <span className={`shrink-0 text-xs ${chat.unread ? "font-semibold text-emerald-600" : "text-muted"}`}>
                          {listTime(chat.updated_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="block min-w-0 flex-1 truncate text-sm text-muted">
                          {chat.lastMessage || KIND_LABEL[chat.kind] || "Chat"}
                        </span>
                        {chat.unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" /> : null}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className={`min-h-0 ${mobileShowChat ? "flex" : "hidden lg:flex"} flex-col`}>
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                <button
                  type="button"
                  className="text-sm text-muted lg:hidden"
                  onClick={() => setMobileShowChat(false)}
                  aria-label="Back"
                >
                  ←
                </button>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-soft text-xs font-bold">
                  {initialsFromName(conversationTitle(active))}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{conversationTitle(active)}</p>
                  <p className="text-xs text-muted">{KIND_LABEL[active.kind] ?? "Chat"}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-[#F3F0FA] px-4 py-3 dark:bg-[#130E1F]">
                {messages.map((msg, i) => {
                  const mine = msg.sender_id === userId;
                  const prev = messages[i - 1];
                  const newDay = !prev || dayKey(prev.created_at) !== dayKey(msg.created_at);
                  const first = newDay || !prev || prev.sender_id !== msg.sender_id;
                  return (
                    <div key={msg.id}>
                      {newDay ? (
                        <p className="mx-auto my-3 w-fit rounded-lg bg-soft px-3 py-1 text-xs font-medium text-muted">
                          {dayLabel(msg.created_at)}
                        </p>
                      ) : null}
                      {msg.message_type === "system" ? (
                        <p className="mx-auto my-2 w-fit max-w-[85%] rounded-lg bg-soft px-3 py-1 text-center text-xs text-muted">
                          {msg.body}
                        </p>
                      ) : (
                        <div className={`flex ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-3 pb-1 pt-1.5 text-sm shadow-sm ${
                              mine ? "bg-[#DCD3FF] text-[#3C315B]" : "bg-white text-[#3C315B]"
                            } ${first ? (mine ? "rounded-tr-sm" : "rounded-tl-sm") : ""}`}
                          >
                            <span className="whitespace-pre-wrap break-words">{msg.body}</span>
                            <span className="float-right ml-3 mt-1.5 text-[10px] leading-none text-[#86848D]">
                              {new Date(msg.created_at).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={onSend} className="flex items-center gap-2 border-t border-border p-2.5">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message"
                  className="h-11 flex-1 rounded-full bg-surface px-4 text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  aria-label="Send"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-50"
                >
                  <SendIcon />
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Hi {displayName.split(" ")[0]}, pick a chat.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
