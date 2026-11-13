"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { NavIcon } from "@/components/nav-icons";
import { createClient } from "@/lib/supabase/client";
import { conversationTitle, ensureSupportConversation } from "@/lib/messaging";
import { initialsFromName } from "@/lib/nav";

type ConversationRow = {
  id: string;
  kind: string;
  subject: string | null;
  updated_at: string;
  lastMessage?: string | null;
  unread?: boolean;
};

type MessageRow = {
  id: string;
  body: string;
  sender_id: string | null;
  created_at: string;
  deleted_at: string | null;
};

type ActivityItem = {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  kind: "inspection" | "enquiry" | "order" | "notification";
};

export function InboxChat({
  userId,
  displayName,
  activity,
}: {
  userId: string;
  displayName: string;
  activity: ActivityItem[];
}) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [query, setQuery] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConversations(preferId?: string | null) {
    const supabase = createClient();
    await ensureSupportConversation(supabase, userId);

    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at, conversations(id, kind, subject, updated_at)")
      .eq("user_id", userId);

    const convIds = (parts || [])
      .map((part) => {
        const conv = Array.isArray(part.conversations) ? part.conversations[0] : part.conversations;
        return conv?.id as string | undefined;
      })
      .filter(Boolean) as string[];

    const { data: recentMessages } = convIds.length
      ? await supabase
          .from("messages")
          .select("conversation_id, body, created_at")
          .in("conversation_id", convIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] as { conversation_id: string; body: string; created_at: string }[] };

    const lastByConv = new Map<string, { body: string; created_at: string }>();
    for (const msg of recentMessages || []) {
      if (!lastByConv.has(msg.conversation_id)) {
        lastByConv.set(msg.conversation_id, { body: msg.body, created_at: msg.created_at });
      }
    }

    const rows: ConversationRow[] = [];
    for (const part of parts || []) {
      const conv = Array.isArray(part.conversations) ? part.conversations[0] : part.conversations;
      if (!conv) continue;
      const last = lastByConv.get(conv.id);
      rows.push({
        id: conv.id,
        kind: conv.kind,
        subject: conv.subject,
        updated_at: conv.updated_at,
        lastMessage: last?.body || null,
        unread: Boolean(
          last?.created_at &&
            (!part.last_read_at || new Date(last.created_at) > new Date(part.last_read_at)),
        ),
      });
    }

    rows.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    setConversations(rows);
    const nextId = preferId || activeId || rows[0]?.id || null;
    setActiveId(nextId);
    setLoading(false);
    return nextId;
  }

  async function loadMessages(conversationId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("id, body, sender_id, created_at, deleted_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setMessages(data || []);

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
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-${activeId}`)
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
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      `${c.subject || ""} ${c.lastMessage || ""} ${c.kind}`.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const active = conversations.find((c) => c.id === activeId) || null;

  async function onSend(event: FormEvent) {
    event.preventDefault();
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
      })
      .select("id, body, sender_id, created_at, deleted_at")
      .single();
    setSending(false);
    if (error) {
      setDraft(body);
      return;
    }
    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      setConversations((prev) =>
        prev
          .map((c) =>
            c.id === activeId
              ? { ...c, lastMessage: body, updated_at: new Date().toISOString() }
              : c,
          )
          .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
      );
    }
  }

  async function startFromActivity(item: ActivityItem) {
    const supabase = createClient();
    const subject =
      item.kind === "enquiry"
        ? `Enquiry · ${item.title}`
        : item.kind === "inspection"
          ? `Inspection · ${item.title}`
          : item.kind === "order"
            ? `Order · ${item.title}`
            : item.title;

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        kind: item.kind === "order" ? "order" : item.kind === "enquiry" ? "listing" : "direct",
        subject,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !conversation) return;

    await supabase.from("conversation_participants").insert({
      conversation_id: conversation.id,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    });

    await supabase.from("messages").insert([
      {
        conversation_id: conversation.id,
        sender_id: null,
        body: item.preview,
      },
      {
        conversation_id: conversation.id,
        sender_id: userId,
        body: `Following up on: ${item.title}`,
      },
    ]);

    const nextId = await loadConversations(conversation.id);
    setActiveId(nextId);
    setMobileShowChat(true);
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg">
      <div className="grid min-h-[70vh] lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section
          className={`border-r border-border ${mobileShowChat ? "hidden lg:flex" : "flex"} flex-col`}
        >
          <div className="border-b border-border p-3">
            <p className="text-sm font-medium">Chats</p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              className="mt-2 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-fg"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-6 text-sm text-muted">Loading chats…</p>
            ) : (
              <>
                {filtered.map((chat) => {
                  const title = conversationTitle({
                    kind: chat.kind,
                    subject: chat.subject,
                  });
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => {
                        setActiveId(chat.id);
                        setMobileShowChat(true);
                      }}
                      className={`flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left hover:bg-surface ${
                        activeId === chat.id ? "bg-surface" : ""
                      }`}
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-inverse-bg text-xs font-medium text-inverse-fg">
                        {initialsFromName(title)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{title}</span>
                          {chat.unread ? <span className="h-2 w-2 rounded-full bg-fg" /> : null}
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-xs text-muted">
                          {chat.lastMessage || "No messages yet"}
                        </span>
                      </span>
                    </button>
                  );
                })}

                {activity.length ? (
                  <div className="border-t border-border p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      Activity to chat
                    </p>
                    <div className="space-y-2">
                      {activity.slice(0, 6).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => void startFromActivity(item)}
                          className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-surface"
                        >
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="line-clamp-1 text-xs text-muted">{item.preview}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className={`${mobileShowChat ? "flex" : "hidden lg:flex"} flex-col bg-surface`}>
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b border-border bg-bg px-3 py-3">
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-xs lg:hidden"
                  onClick={() => setMobileShowChat(false)}
                >
                  Back
                </button>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-inverse-bg text-xs font-medium text-inverse-fg">
                  {initialsFromName(
                    conversationTitle({ kind: active.kind, subject: active.subject }),
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {conversationTitle({ kind: active.kind, subject: active.subject })}
                  </p>
                  <p className="text-xs text-muted">CampusOS messaging · {displayName}</p>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-5">
                {messages.map((msg) => {
                  const mine = msg.sender_id === userId;
                  const system = !msg.sender_id;
                  if (system) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <p className="max-w-[85%] rounded-full bg-bg px-3 py-1 text-center text-[11px] text-muted ring-1 ring-border">
                          {msg.body}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          mine
                            ? "rounded-br-md bg-chat-mine text-chat-mine-fg"
                            : "rounded-bl-md bg-chat-theirs text-chat-theirs-fg"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-chat-mine-fg/70" : "text-muted"}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={onSend} className="border-t border-border bg-bg p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={1}
                    placeholder="Type a message"
                    className="max-h-32 min-h-11 flex-1 resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-fg"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void onSend(e as unknown as FormEvent);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-inverse-bg text-inverse-fg disabled:opacity-40"
                    aria-label="Send"
                  >
                    <NavIcon name="send" className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">
              Select a chat to start messaging
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
