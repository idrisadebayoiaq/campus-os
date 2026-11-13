"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";

const MODES = [
  { id: "explain", label: "Explain" },
  { id: "examples", label: "Examples" },
  { id: "practice", label: "Practice" },
  { id: "step", label: "Teach Me Step-by-Step" },
] as const;

type Msg = { role: "user" | "assistant"; content: string };

export function AiTutorPanel() {
  const searchParams = useSearchParams();
  const course = searchParams.get("course") || "";
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("explain");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryOut, setSummaryOut] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendTutor(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");

    const res = await fetch("/api/study/ai/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        prompt: text,
        course: course || undefined,
        messages: next,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Tutor request failed.");
      return;
    }
    setModel(json.model || null);
    setMessages([...next, { role: "assistant", content: json.content }]);
  }

  async function summarize(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSummaryOut(null);
    const res = await fetch("/api/study/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summary, course: course || undefined }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Summarize failed.");
      return;
    }
    setModel(json.model || null);
    setSummaryOut(json.summary);
  }

  return (
    <div className="space-y-10">
      <p className="text-xs text-muted">
        CampusOS AI is a learning aid — not for completing graded work for you.
        {model ? ` Model: ${model}` : ""}
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">AI tutor</h2>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-md border px-3 py-2 text-sm ${mode === m.id ? "border-fg bg-surface" : "border-border"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {course ? <p className="text-sm text-muted">Course context: {course}</p> : null}

        <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-border p-4">
          {messages.length ? (
            messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "assistant" ? "text-fg" : "text-muted"}`}>
                <span className="font-medium capitalize">{m.role}: </span>
                <span className="whitespace-pre-wrap">{m.content}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">Ask a question to start.</p>
          )}
        </div>

        <form onSubmit={sendTutor} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="h-11 flex-1 rounded-md border border-border bg-bg px-3 text-sm"
            placeholder={mode === "step" ? "Your answer or question…" : "What should CampusOS explain?"}
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Thinking…" : "Send"}
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Notes summarizer</h2>
        <form onSubmit={summarize} className="space-y-3">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            placeholder="Paste lecture notes…"
          />
          <Button type="submit" disabled={loading}>
            Summarize
          </Button>
        </form>
        {summaryOut ? (
          <div className="whitespace-pre-wrap rounded-md border border-border bg-surface p-4 text-sm">
            {summaryOut}
          </div>
        ) : null}
      </section>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
