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
    if (filter === "all") return conversations;
    return conversations.filter((c) => c.kind === filter);
  }, [conversations, filter]);

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
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="grid min-h-[70vh] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section
          className={`border-r border-border ${mobileShowChat ? "hidden lg:flex" : "flex"} flex-col`}
        >
          <div className="space-y-2 border-b border-border p-3">
            <p className="text-sm font-semibold">Inbox</p>
            <p className="text-xs text-muted">Messages from students · WhatsApp-style</p>
            <div className="flex gap-1">
              {[
                ["all", "All"],
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
                No messages yet. When students message your listings or orders, they appear here.
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
                    className={`flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left hover:bg-surface ${
                      chat.id === activeId ? "bg-surface" : ""
                    }`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-soft text-xs font-bold">
                      {initialsFromName(title)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{title}</span>
                        {chat.unread ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {chat.lastMessage || chat.kind}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className={`${mobileShowChat ? "flex" : "hidden lg:flex"} flex-col`}>
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button
                  type="button"
                  className="text-sm text-muted lg:hidden"
                  onClick={() => setMobileShowChat(false)}
                >
                  Back
                </button>
                <div>
                  <p className="font-semibold">{conversationTitle(active)}</p>
                  <p className="text-xs text-muted">{active.kind}</p>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-surface/40 px-4 py-4">
                {messages.map((msg) => {
                  const mine = msg.sender_id === userId;
                  if (msg.message_type === "system") {
                    return (
                      <p key={msg.id} className="text-center text-xs text-muted">
                        {msg.body}
                      </p>
                    );
                  }
                  return (
                    <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          mine ? "bg-fg text-bg" : "border border-border bg-bg"
                        }`}
                      >
                        {msg.body}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={onSend} className="flex gap-2 border-t border-border p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply to student…"
                  className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-sm"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="h-11 rounded-full bg-fg px-5 text-sm font-semibold text-bg disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Hi {displayName.split(" ")[0]} — select a conversation.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
