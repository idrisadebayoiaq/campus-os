"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  body: string;
  sender_id: string | null;
  message_type: string;
  created_at: string;
};

type Ticket = { id: string; number: number; conversation_id: string };

type AssistantResponse = {
  conversationId?: string;
  messages?: Row[];
  ticket?: Ticket | null;
  error?: string;
};

const STARTERS = [
  "Why is my application still under review?",
  "How do I add photos to my listing?",
  "How do I change my opening hours?",
  "I was charged but my payment failed",
];

async function callAssistant(body: Record<string, unknown>): Promise<AssistantResponse> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("support-assistant", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as AssistantResponse;
        if (parsed?.error) return { error: parsed.error };
      } catch {
        // fall through
      }
    }
    return { error: "The assistant is unavailable right now. Use Chat with support instead." };
  }
  return data as AssistantResponse;
}

export function AssistantChat({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const res = await callAssistant({ action: "open" });
      if (res.error) setError(res.error);
      setMessages(res.messages ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, thinking]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || thinking) return;
    setDraft("");
    setError(null);
    setThinking(true);
    const optimistic: Row = {
      id: `local-${Date.now()}`,
      body,
      sender_id: userId,
      message_type: "text",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const res = await callAssistant({ action: "send", message: body });
    setThinking(false);
    if (res.error) {
      setError(res.error);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      return;
    }
    setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), ...(res.messages ?? [])]);
    if (res.ticket) setTicket(res.ticket);
  }

  async function handoff() {
    if (thinking) return;
    setThinking(true);
    setError(null);
    const res = await callAssistant({ action: "handoff" });
    setThinking(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessages((prev) => [...prev, ...(res.messages ?? [])]);
    if (res.ticket) setTicket(res.ticket);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  const asked = messages.some((m) => m.sender_id === userId);

  return (
    <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">
            AI
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-success" />
          </span>
          <div>
            <p className="text-sm font-semibold">CampusOS Assistant</p>
            <p className="text-xs text-muted">Replies instantly · hands you to a person when needed</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handoff()}
          disabled={thinking || loading}
          className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface disabled:opacity-50"
        >
          Talk to a person
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-surface/50 px-3 py-4 sm:px-5" style={{ maxHeight: "60vh" }}>
        {loading ? <p className="text-center text-sm text-muted">Starting the assistant…</p> : null}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          if (m.message_type === "system") {
            return (
              <p key={m.id} className="text-center text-xs text-muted">
                {m.body}
              </p>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%] ${
                  mine ? "bg-accent text-on-accent" : "border border-border bg-bg text-fg"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        {thinking ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-bg px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        ) : null}
        {ticket ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-center text-sm">
            <p className="font-semibold">Ticket #{ticket.number} is with the support team</p>
            <Link
              href={`/support/tickets/${ticket.id}`}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent"
            >
              Open ticket chat
            </Link>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {!asked && !loading ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-3">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs hover:border-accent"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          placeholder="Ask the assistant anything…"
          className="min-h-[2.75rem] flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={thinking || !draft.trim()}
          className="h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {error ? <p className="px-4 pb-3 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
