"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui";

export function StudyAssist() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setAnswer(null);
    const res = await fetch("/api/study-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "CampusOS study helper failed.");
      return;
    }
    setAnswer(json.answer);
  }

  return (
    <section className="space-y-4 rounded-md border border-border p-5">
      <h2 className="text-lg font-medium">CampusOS study helper</h2>
      <p className="text-sm text-muted">
        Ask for explanations or revision tips. CampusOS will not take exams for you.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          required
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
          placeholder="Explain Ohm's law with a campus example"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Thinking…" : "Ask CampusOS"}
        </Button>
      </form>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {answer ? (
        <div className="rounded-md border border-border bg-surface p-4 text-sm whitespace-pre-wrap">
          {answer}
        </div>
      ) : null}
    </section>
  );
}
