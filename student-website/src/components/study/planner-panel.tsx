"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Block = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  kind: string;
};

type CourseOpt = { id: string; code: string };

export function PlannerPanel({ blocks, courses }: { blocks: Block[]; courses: CourseOpt[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("study_plan_blocks").delete().eq("id", id);
    router.refresh();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const courseId = String(form.get("course_id") || "") || null;

    const { error } = await supabase.from("study_plan_blocks").insert({
      user_id: user.id,
      course_id: courseId,
      title: String(form.get("title")),
      starts_at: String(form.get("starts_at")),
      ends_at: String(form.get("ends_at")),
      kind: String(form.get("kind") || "revision"),
    });

    setStatus(error ? error.message : "Block planned.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {blocks.length ? (
          blocks.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{b.title}</p>
                <p className="text-muted">
                  {new Date(b.starts_at).toLocaleString()} – {new Date(b.ends_at).toLocaleString()} · {b.kind}
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={() => remove(b.id)}>
                Delete
              </Button>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-muted">No study blocks yet.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" required placeholder="Revise chapter 3" />
        </Field>
        <Field label="Kind">
          <select name="kind" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="revision">Revision</option>
            <option value="lecture">Lecture prep</option>
            <option value="assignment">Assignment</option>
            <option value="break">Break</option>
          </select>
        </Field>
        <Field label="Starts">
          <Input name="starts_at" type="datetime-local" required />
        </Field>
        <Field label="Ends">
          <Input name="ends_at" type="datetime-local" required />
        </Field>
        <Field label="Course (optional)">
          <select name="course_id" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="">None</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit">Add block</Button>
        {status ? <p className="text-sm text-muted sm:col-span-2">{status}</p> : null}
      </form>
    </div>
  );
}
