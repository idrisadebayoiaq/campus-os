"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Exam = {
  id: string;
  course_code: string;
  title: string | null;
  starts_at: string;
  venue: string | null;
};

type CourseOpt = { id: string; code: string; title: string };

function countdownLabel(starts_at: string) {
  const diff = new Date(starts_at).getTime() - Date.now();
  if (diff <= 0) return "Started or past";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

export function ExamsPanel({ exams, courses }: { exams: Exam[]; courses: CourseOpt[] }) {
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

    const courseId = String(form.get("course_id") || "") || null;
    const course = courses.find((c) => c.id === courseId);

    const { error } = await supabase.from("exam_entries").insert({
      user_id: user.id,
      course_id: courseId,
      course_code: course?.code || String(form.get("course_code")),
      title: String(form.get("title") || "") || null,
      starts_at: String(form.get("starts_at")),
      venue: String(form.get("venue") || "") || null,
      notes: String(form.get("notes") || "") || null,
    });

    setStatus(error ? error.message : "Exam saved.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {exams.length ? (
          exams.map((exam) => (
            <div key={exam.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{exam.title || exam.course_code}</p>
                <p className="text-muted">
                  {exam.course_code} · {new Date(exam.starts_at).toLocaleString()}
                  {exam.venue ? ` · ${exam.venue}` : ""}
                </p>
              </div>
              <span className="rounded-md border border-border px-2 py-1 text-xs tabular-nums">
                {countdownLabel(exam.starts_at)}
              </span>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-muted">No exams scheduled.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Field label="Course">
          <select name="course_id" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="">Manual code</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course code">
          <Input name="course_code" placeholder="CSC 201" required />
        </Field>
        <Field label="Title">
          <Input name="title" placeholder="Final exam" />
        </Field>
        <Field label="Starts at">
          <Input name="starts_at" type="datetime-local" required />
        </Field>
        <Field label="Venue">
          <Input name="venue" placeholder="Main hall" />
        </Field>
        <Field label="Notes">
          <Input name="notes" placeholder="What to bring" />
        </Field>
        <Button type="submit">Add exam</Button>
        {status ? <p className="text-sm text-muted sm:col-span-2">{status}</p> : null}
      </form>
    </div>
  );
}
