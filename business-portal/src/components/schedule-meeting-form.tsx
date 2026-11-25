"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function ScheduleMeetingForm({
  studentUserId,
  classId,
  studentLabel,
}: {
  studentUserId: string;
  classId?: string | null;
  studentLabel: string;
}) {
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setError("Sign in required");
      return;
    }
    const mode = String(form.get("mode") || "video");
    const room = `meet-${user.id.slice(0, 6)}-${studentUserId.slice(0, 6)}-${Date.now()}`;
    const { error: insertError } = await supabase
      .from("staff_student_meetings")
      .insert({
        lecturer_user_id: user.id,
        student_user_id: studentUserId,
        class_id: classId || null,
        title: String(form.get("title") || "").trim() || `Meeting with ${studentLabel}`,
        mode,
        scheduled_at: new Date(String(form.get("scheduled_at") || "")).toISOString(),
        status: "scheduled",
        room_name: room,
        notes: String(form.get("notes") || "").trim() || null,
      });
    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOk("Meeting scheduled.");
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Schedule call with {studentLabel}</p>
      <Field label="Title">
        <Input name="title" placeholder="Office hours" />
      </Field>
      <Field label="When">
        <Input name="scheduled_at" type="datetime-local" required />
      </Field>
      <Field label="Mode">
        <select
          name="mode"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          defaultValue="video"
        >
          <option value="video">Video</option>
          <option value="voice">Voice</option>
        </select>
      </Field>
      <Field label="Notes">
        <Input name="notes" placeholder="Optional" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Scheduling…" : "Schedule meeting"}
      </Button>
    </form>
  );
}
