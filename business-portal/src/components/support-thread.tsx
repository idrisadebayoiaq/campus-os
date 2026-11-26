"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/support";

type Row = {
  id: string;
  body: string;
  sender_id: string | null;
  created_at: string;
  message_type: string | null;
};

type Sender = { name: string; isAgent: boolean };

export type SavedReply = { id: string; title: string; body: string };

/**
 * One support ticket's chat. The person who asked and the support team both use
 * it; `asAgent` switches the labels and adds saved replies.
 */
export function SupportThread({
  conversationId,
  userId,
  asAgent = false,
  requesterName,
  resolved = false,
  savedReplies = [],
}: {
  conversationId: string;
  userId: string;
  asAgent?: boolean;
  requesterName?: string;
  resolved?: boolean;
  savedReplies?: SavedReply[];
}) {
  const [messages, setMessages] = useState<Row[]>([]);
  const [senders, setSenders] = useState<Record<string, Sender>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadSenders() {
    const supabase = createClient();
    const { data } = await supabase.rpc("support_sender_names", { p_conversation: conversationId });
    const map: Record<string, Sender> = {};
    for (const row of (data ?? []) as { user_id: string; name: string; is_agent: boolean }[]) {
      map[row.user_id] = { name: row.name, isAgent: row.is_agent };
    }
    setSenders(map);
  }

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, body, sender_id, created_at, message_type")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setMessages((data as Row[]) ?? []);
      setLoading(false);
      await loadSenders();
      if (!asAgent) {
        await supabase
          .from("conversation_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("user_id", userId);
      }
    })();

    const channel = supabase
      .channel(`support-thread-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Row;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_id && !senders[row.sender_id]) void loadSenders();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId, asAgent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    const supabase = createClient();
    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: userId, body, message_type: "text" })
      .select("id, body, sender_id, created_at, message_type")
      .single();
    setSending(false);
    if (sendError) {
      setDraft(body);
      setError(sendError.message);
      return;
    }
    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Row]));
    }
  }

  function labelFor(row: Row) {
    if (row.sender_id === userId) return "You";
    const s = row.sender_id ? senders[row.sender_id] : undefined;
    if (asAgent) {
      if (s?.isAgent) return `${s.name} · Support`;
      return requesterName || s?.name || "User";
    }
    return s ? `${s.name} · CampusOS Support` : "CampusOS Support";
  }

  return (
    <div className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="flex-1 space-y-3 overflow-y-auto bg-surface/50 px-3 py-4 sm:px-5" style={{ maxHeight: "60vh" }}>
        {loading ? <p className="text-center text-sm text-muted">Loading conversation…</p> : null}
        {messages.map((m) => {
          if (m.message_type === "system") {
            return (
              <p key={m.id} className="mx-auto max-w-md rounded-full bg-soft px-4 py-1.5 text-center text-xs text-muted">
                {m.body}
              </p>
            );
          }
          const mine = m.sender_id === userId;
          const fromTeam = asAgent
            ? Boolean(m.sender_id && senders[m.sender_id]?.isAgent)
            : !mine;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="mb-1 px-1 text-[11px] text-muted">
                {labelFor(m)} · {timeAgo(m.created_at)}
              </span>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%] ${
                  mine
                    ? "bg-accent text-on-accent"
                    : fromTeam
                      ? "border border-accent/40 bg-accent-soft text-fg"
                      : "border border-border bg-bg text-fg"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSend} className="space-y-2 border-t border-border p-3">
        {asAgent && savedReplies.length ? (
          <select
            aria-label="Insert a saved reply"
            value=""
            onChange={(e) => {
              const reply = savedReplies.find((r) => r.id === e.target.value);
              if (reply) setDraft((d) => (d ? `${d}\n\n${reply.body}` : reply.body));
            }}
            className="h-9 w-full rounded-xl px-3 text-xs sm:w-64"
          >
            <option value="">Insert a saved reply…</option>
            {savedReplies.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder={
              asAgent
                ? "Reply to the user… (Enter to send, Shift+Enter for a new line)"
                : resolved
                  ? "Still need help? Reply to reopen this ticket"
                  : "Write a message to support…"
            }
            className="min-h-[2.75rem] flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </form>
    </div>
  );
}
