"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";
import { Button } from "@/components/ui";

const MODES = [
  { id: "explain", label: "Explain", hint: "Clear concepts + a quick check" },
  { id: "examples", label: "Examples", hint: "Worked examples by difficulty" },
  { id: "practice", label: "Practice", hint: "Questions, then hints & solutions" },
  { id: "step", label: "Step-by-step", hint: "Guided questions one at a time" },
  { id: "summarize", label: "Summarize", hint: "Paste notes to condense" },
] as const;

type ModeId = (typeof MODES)[number]["id"];
type Msg = { id: string; role: "user" | "assistant"; content: string };

const STARTERS = [
  "Explain quadratic equations like I'm in 100L",
  "Give examples of stoichiometry mole calculations",
  "Quiz me on cellular respiration",
  "Help me plan a revision timetable for exams",
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AiTutorPanel() {
  const searchParams = useSearchParams();
  const course = searchParams.get("course") || "";
  const [mode, setMode] = useState<ModeId>("explain");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function newChat() {
    setMessages([]);
    setError(null);
    setModel(null);
    setInput("");
    textareaRef.current?.focus();
  }

  async function copyMessage(msg: Msg) {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function sendMessage(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    const userMsg: Msg = { id: uid(), role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");

    try {
      if (mode === "summarize") {
        const res = await fetch("/api/study/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, course: course || undefined }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Summarize failed.");
          setLoading(false);
          return;
        }
        setModel(json.model || null);
        setMessages([
          ...history,
          {
            id: uid(),
            role: "assistant",
            content: json.summary || "No summary returned.",
          },
        ]);
      } else {
        const res = await fetch("/api/study/ai/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            prompt: text,
            course: course || undefined,
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Tutor request failed.");
          setLoading(false);
          return;
        }
        setModel(json.model || null);
        setMessages([
          ...history,
          {
            id: uid(),
            role: "assistant",
            content: json.content || "No answer returned.",
          },
        ]);
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const empty = messages.length === 0 && !loading;

  return (
    <div className="flex min-h-[min(70dvh,44rem)] flex-col overflow-hidden rounded-xl border border-border bg-bg">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">CampusOS AI</p>
          <p className="truncate text-xs text-muted">
            {activeMode.hint}
            {course ? ` · ${course}` : ""}
            {model ? ` · ${model}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-9 px-3 text-xs"
            onClick={newChat}
          >
            New chat
          </Button>
        </div>
      </div>

      {/* Modes */}
      <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2 sm:px-4">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              mode === m.id
                ? "border-fg bg-fg text-bg"
                : "border-border bg-bg text-muted hover:bg-surface hover:text-fg"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        className="sidebar-scroll flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-6"
      >
        {empty ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-inverse-bg text-inverse-fg">
              <NavIcon name="ai" className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                How can I help you study?
              </h2>
              <p className="text-sm text-muted">
                Learning aid only — not for graded exams or CA. Shift+Enter for a new line.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void sendMessage(starter)}
                  className="rounded-xl border border-border bg-surface px-3 py-3 text-left text-sm text-fg transition hover:bg-bg"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`group max-w-[min(100%,40rem)] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    mine
                      ? "bg-chat-mine text-chat-mine-fg"
                      : "bg-chat-theirs text-chat-theirs-fg"
                  }`}
                >
                  {!mine ? (
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-60">
                      CampusOS AI
                    </p>
                  ) : null}
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  {!mine ? (
                    <div className="mt-2 flex justify-end opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => void copyMessage(m)}
                        className="rounded-md px-2 py-1 text-[11px] font-medium opacity-80 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                      >
                        {copiedId === m.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}

        {loading ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-chat-theirs px-4 py-3 text-sm text-chat-theirs-fg">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                  style={{ animationDelay: "120ms" }}
                />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                  style={{ animationDelay: "240ms" }}
                />
                <span className="ml-2 text-xs text-muted">Thinking…</span>
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-danger/30 bg-surface px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-bg p-3 sm:p-4">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={loading}
            placeholder={
              mode === "summarize"
                ? "Paste lecture notes to summarize…"
                : mode === "step"
                  ? "Your answer or next question…"
                  : "Message CampusOS AI…"
            }
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-fg outline-none placeholder:text-muted"
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 shrink-0 gap-2 rounded-xl px-4"
            aria-label="Send message"
          >
            <NavIcon name="send" className="h-4 w-4" />
            <span>Send</span>
          </Button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted">
          CampusOS AI can make mistakes. Verify with your notes and lecturers.
        </p>
      </div>
    </div>
  );
}
