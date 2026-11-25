"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function ClassAnnouncementForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("publish_class_announcement", {
      p_class_id: classId,
      p_title: String(form.get("title") || ""),
      p_body: String(form.get("body") || ""),
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOk("Announcement sent to enrolled students.");
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border p-4">
      <Field label="Title">
        <Input name="title" required placeholder="Class postponed" />
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
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Publishing…" : "Publish announcement"}
      </Button>
    </form>
  );
}
