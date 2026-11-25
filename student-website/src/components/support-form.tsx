"use client";

import { FormEvent, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function SupportForm() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") || "").trim() || "Website support";
    const message = String(form.get("message") || "").trim();
    if (!message) {
      setLoading(false);
      setStatus("Write a short message so we can help.");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("support_tickets").insert({
      user_id: user?.id || null,
      email: user?.email || null,
      subject,
      message,
      source: "student_website",
    });

    setLoading(false);
    if (error) {
      window.location.href = `mailto:support@campusos.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      setStatus("Opened your email client.");
      return;
    }
    event.currentTarget.reset();
    setStatus("Ticket sent. We'll reply by email.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <Field label="Subject">
        <Input name="subject" placeholder="e.g. Housing enquiry stuck" />
      </Field>
      <Field label="Message">
        <textarea
          name="message"
          required
          rows={5}
          placeholder="Describe what happened…"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-muted focus:border-fg"
        />
      </Field>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
