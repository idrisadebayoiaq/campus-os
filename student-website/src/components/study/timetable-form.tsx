"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { DAYS, findTimetableOverlaps, type TimetableRow } from "@/lib/study/utils";
import { createClient } from "@/lib/supabase/client";

type CourseOpt = { id: string; code: string; title: string };

export function TimetableForm({
  rows,
  courses,
}: {
  rows: TimetableRow[];
  courses: CourseOpt[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const warnings = useMemo(() => findTimetableOverlaps(rows), [rows]);

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

    const { error } = await supabase.from("timetable_entries").insert({
      user_id: user.id,
      course_id: courseId,
      course_code: course?.code || String(form.get("course_code")),
      course_title: course?.title || String(form.get("course_title") || "") || null,
      day_of_week: Number(form.get("day_of_week")),
      start_time: String(form.get("start_time")),
      end_time: String(form.get("end_time")),
      venue: String(form.get("venue") || "") || null,
      lecturer: String(form.get("lecturer") || "") || null,
    });

    setStatus(error ? error.message : "Class added.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {warnings.length ? (
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-fg">Overlap warning</p>
          <ul className="mt-2 list-disc pl-5 text-muted">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-3">
        <Field label="Linked course">
          <select name="course_id" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="">Manual code</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course code">
          <Input name="course_code" placeholder="CSC 201" required />
        </Field>
        <Field label="Title">
          <Input name="course_title" placeholder="Optional title" />
        </Field>
        <Field label="Day">
          <select
            name="day_of_week"
            className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
            defaultValue={1}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start">
          <Input name="start_time" type="time" required />
        </Field>
        <Field label="End">
          <Input name="end_time" type="time" required />
        </Field>
        <Field label="Venue">
          <Input name="venue" placeholder="LT1" />
        </Field>
        <Field label="Lecturer">
          <Input name="lecturer" placeholder="Dr. …" />
        </Field>
        <div className="flex items-end sm:col-span-3">
          <Button type="submit">Add class</Button>
        </div>
        {status ? <p className="text-sm text-muted sm:col-span-3">{status}</p> : null}
      </form>
    </div>
  );
}
