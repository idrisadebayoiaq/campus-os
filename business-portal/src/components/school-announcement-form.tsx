"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function SchoolAnnouncementForm({ institutionId }: { institutionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("school_announcements").insert({
      institution_id: institutionId,
      author_user_id: user!.id,
      title: String(form.get("title") || "").trim(),
      body: String(form.get("body") || "").trim(),
      audience: String(form.get("audience") || "all"),
    });
    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border p-4">
      <Field label="Title">
        <Input name="title" required />
      </Field>
      <Field label="Audience">
        <select
          name="audience"
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
          defaultValue="all"
        >
          <option value="all">Everyone</option>
          <option value="students">Students</option>
          <option value="lecturers">Lecturers</option>
        </select>
      </Field>
      <Field label="Message">
        <textarea
          name="body"
          required
          rows={4}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Publishing…" : "Publish"}
      </Button>
    </form>
  );
}
