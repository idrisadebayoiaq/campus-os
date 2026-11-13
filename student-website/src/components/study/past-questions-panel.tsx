"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Doc = {
  id: string;
  title: string;
  course_code: string;
  session_label: string | null;
  content: string | null;
  is_public_to_campus: boolean;
};

export function PastQuestionsPanel({
  docs,
  campusId,
}: {
  docs: Doc[];
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

    const { error } = await supabase.from("past_question_docs").insert({
      user_id: user.id,
      campus_id: campusId || null,
      course_code: String(form.get("course_code")).toUpperCase(),
      session_label: String(form.get("session_label") || "") || null,
      title: String(form.get("title")),
      content: String(form.get("content") || "") || null,
      is_public_to_campus: form.get("is_public") === "on",
    });

    setStatus(error ? error.message : "Past question saved.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {docs.length ? (
          docs.map((d) => (
            <div key={d.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{d.title}</p>
              <p className="text-muted">
                {d.course_code}
                {d.session_label ? ` · ${d.session_label}` : ""}
                {d.is_public_to_campus ? " · campus" : " · private"}
              </p>
              {d.content ? (
                <p className="mt-2 whitespace-pre-wrap text-muted">{d.content.slice(0, 400)}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-muted">No past questions uploaded for your campus yet.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Field label="Course code">
          <Input name="course_code" required placeholder="CSC 201" />
        </Field>
        <Field label="Session">
          <Input name="session_label" placeholder="2019/2020" />
        </Field>
        <Field label="Title">
          <Input name="title" required placeholder="Mid-semester past questions" className="sm:col-span-2" />
        </Field>
        <Field label="Content / summary">
          <textarea
            name="content"
            rows={4}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm sm:col-span-2"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input name="is_public" type="checkbox" className="size-4 rounded border-border" />
          Share with campus (metadata only)
        </label>
        <Button type="submit">Add document</Button>
        {status ? <p className="text-sm text-muted sm:col-span-2">{status}</p> : null}
      </form>
    </div>
  );
}
