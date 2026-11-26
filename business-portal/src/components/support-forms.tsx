"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_OPTIONS } from "@/lib/support";

export function NewTicketForm({ defaultCategory = "" }: { defaultCategory?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const category = String(form.get("category") || "other");
    const subject = String(form.get("subject") || "").trim();
    const message = String(form.get("message") || "").trim();
    if (!message) {
      setError("Tell us what you need help with.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("open_support_ticket", {
      p_subject: subject || message.slice(0, 80),
      p_message: message,
      p_category: category,
    });
    setBusy(false);
    if (rpcError || !data) {
      setError(rpcError?.message ?? "Could not create your ticket.");
      return;
    }
    router.push(`/support/tickets/${(data as { id: string }).id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="What is it about?">
        <select name="category" defaultValue={defaultCategory || "account"} className="h-11 w-full rounded-2xl px-3 text-sm">
          {CATEGORY_OPTIONS.filter((c) => !c.student).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subject">
        <Input name="subject" maxLength={120} placeholder="A short summary, e.g. Payout not received" />
      </Field>
      <Field label="Message">
        <textarea
          name="message"
          required
          rows={6}
          maxLength={4000}
          placeholder="Tell us what happened, what you expected, and any business, listing or order names."
          className="w-full rounded-2xl px-4 py-3 text-sm"
        />
      </Field>
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Sending…" : "Send to support"}
      </Button>
    </form>
  );
}

export function TicketRating({
  ticketId,
  rating,
  comment,
}: {
  ticketId: string;
  rating: number | null;
  comment: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(rating ?? 0);
  const [hover, setHover] = useState(0);
  const [note, setNote] = useState(comment ?? "");
  const [saved, setSaved] = useState(Boolean(rating));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value) return;
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("rate_support_ticket", {
      p_ticket: ticketId,
      p_rating: value,
      p_comment: note || null,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">{saved ? "Thanks for your rating" : "How did we do?"}</p>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => {
              setValue(n);
              setSaved(false);
            }}
            className={`text-2xl leading-none transition ${
              n <= (hover || value) ? "text-accent" : "text-border"
            }`}
          >
            ★
          </button>
        ))}
      </div>
      {!saved && value ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything we could do better? (optional)"
          />
          <Button type="button" onClick={() => void save()} className="shrink-0">
            Submit rating
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
