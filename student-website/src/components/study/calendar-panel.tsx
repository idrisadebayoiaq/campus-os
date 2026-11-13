"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type CalEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  source: string;
};

export function CalendarPanel({
  events,
  campusId,
}: {
  events: CalEvent[];
  campusId?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const scope = String(form.get("scope"));
    const { error } = await supabase.from("academic_calendar_events").insert({
      title: String(form.get("title")),
      starts_at: String(form.get("starts_at")),
      ends_at: String(form.get("ends_at") || "") || null,
      source: scope === "community" ? "community" : "personal",
      user_id: scope === "personal" ? user.id : null,
      campus_id: scope === "community" ? campusId || null : null,
    });

    setStatus(error ? error.message : "Event added.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {events.length ? (
          events.map((e) => (
            <div key={e.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{e.title}</p>
              <p className="text-muted">
                {e.starts_at}
                {e.ends_at ? ` → ${e.ends_at}` : ""} · {e.source}
              </p>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-muted">No calendar events yet.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" required placeholder="Registration closes" />
        </Field>
        <Field label="Scope">
          <select name="scope" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="personal">Personal</option>
            <option value="community">Community (campus)</option>
          </select>
        </Field>
        <Field label="Starts">
          <Input name="starts_at" type="date" required />
        </Field>
        <Field label="Ends (optional)">
          <Input name="ends_at" type="date" />
        </Field>
        <Button type="submit">Add event</Button>
        {status ? <p className="text-sm text-muted sm:col-span-2">{status}</p> : null}
      </form>
    </div>
  );
}
