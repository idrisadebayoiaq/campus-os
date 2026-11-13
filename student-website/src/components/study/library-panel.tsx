"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  title: string;
  kind: string;
  content: string | null;
  url: string | null;
  course_id: string | null;
};

type CourseOpt = { id: string; code: string };

export function LibraryPanel({ items, courses }: { items: Item[]; courses: CourseOpt[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("study_library_items").delete().eq("id", id);
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

    const { error } = await supabase.from("study_library_items").insert({
      user_id: user.id,
      course_id: courseId,
      title: String(form.get("title")),
      kind: String(form.get("kind") || "note"),
      content: String(form.get("content") || "") || null,
      url: String(form.get("url") || "") || null,
    });

    setStatus(error ? error.message : "Saved to library.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-muted">{item.kind}</p>
                {item.url ? (
                  <a href={item.url} className="underline" target="_blank" rel="noreferrer">
                    {item.url}
                  </a>
                ) : item.content ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted">{item.content.slice(0, 200)}</p>
                ) : null}
              </div>
              <Button type="button" variant="ghost" onClick={() => remove(item.id)}>
                Delete
              </Button>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-muted">Your library is empty.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" required />
        </Field>
        <Field label="Kind">
          <select name="kind" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="note">Note</option>
            <option value="link">Link</option>
            <option value="summary">Summary</option>
            <option value="pdf">PDF ref</option>
          </select>
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
        <Field label="URL">
          <Input name="url" placeholder="https://…" />
        </Field>
        <Field label="Content">
          <textarea
            name="content"
            rows={3}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm sm:col-span-2"
          />
        </Field>
        <Button type="submit">Save item</Button>
        {status ? <p className="text-sm text-muted sm:col-span-2">{status}</p> : null}
      </form>
    </div>
  );
}
