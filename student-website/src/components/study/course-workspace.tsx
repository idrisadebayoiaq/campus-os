"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { DAYS } from "@/lib/study/utils";
import { createClient } from "@/lib/supabase/client";

type Course = {
  id: string;
  code: string;
  title: string;
  units: number;
};

type Props = {
  course: Course;
  timetable: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  exams: Record<string, unknown>[];
  topics: Record<string, unknown>[];
  library: Record<string, unknown>[];
  mastery: Record<string, unknown>[];
};

const TOPIC_STATUSES = ["not_started", "in_progress", "done", "review"] as const;

export function CourseWorkspace({
  course,
  timetable,
  tasks,
  exams,
  topics,
  library,
  mastery,
}: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function insert(
    table: string,
    row: Record<string, unknown>,
    label: string,
  ) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from(table).insert(row);
    setMsg(error ? error.message : `${label} saved.`);
    if (!error) router.refresh();
  }

  async function addTopic(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await insert(
      "syllabus_topics",
      {
        user_id: user.id,
        course_id: course.id,
        title: String(form.get("title")),
        sort_order: topics.length,
      },
      "Topic",
    );
    e.currentTarget.reset();
  }

  async function setTopicStatus(id: string, status: string) {
    const supabase = createClient();
    await supabase.from("syllabus_topics").update({ status }).eq("id", id);
    router.refresh();
  }

  async function addTimetable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await insert(
      "timetable_entries",
      {
        user_id: user.id,
        course_id: course.id,
        course_code: course.code,
        course_title: course.title,
        day_of_week: Number(form.get("day_of_week")),
        start_time: String(form.get("start_time")),
        end_time: String(form.get("end_time")),
        venue: String(form.get("venue") || "") || null,
        lecturer: String(form.get("lecturer") || "") || null,
      },
      "Class slot",
    );
    e.currentTarget.reset();
  }

  async function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await insert(
      "academic_tasks",
      {
        user_id: user.id,
        course_id: course.id,
        course_code: course.code,
        title: String(form.get("title")),
        description: String(form.get("description") || "") || null,
        due_at: String(form.get("due_at") || "") || null,
      },
      "Task",
    );
    e.currentTarget.reset();
  }

  async function addExam(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await insert(
      "exam_entries",
      {
        user_id: user.id,
        course_id: course.id,
        course_code: course.code,
        title: String(form.get("title") || course.title),
        starts_at: String(form.get("starts_at")),
        venue: String(form.get("venue") || "") || null,
      },
      "Exam",
    );
    e.currentTarget.reset();
  }

  async function addLibrary(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await insert(
      "study_library_items",
      {
        user_id: user.id,
        course_id: course.id,
        title: String(form.get("title")),
        kind: String(form.get("kind") || "note"),
        content: String(form.get("content") || "") || null,
        url: String(form.get("url") || "") || null,
      },
      "Library item",
    );
    e.currentTarget.reset();
  }

  async function upsertMastery(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const topic = String(form.get("topic"));
    const { error } = await supabase.from("topic_mastery").upsert(
      {
        user_id: user.id,
        course_id: course.id,
        topic,
        state: String(form.get("state") || "in_progress"),
        score: Number(form.get("score") || 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_id,topic" },
    );
    setMsg(error ? error.message : "Mastery updated.");
    if (!error) router.refresh();
    e.currentTarget.reset();
  }

  const aiHref = `/study/ai?course=${encodeURIComponent(course.code)}`;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{course.units} credit units</p>
        <Link
          href={aiHref}
          className="inline-flex h-11 items-center justify-center rounded-md bg-inverse-bg px-4 text-sm font-medium text-inverse-fg hover:opacity-90"
        >
          Ask AI about this course
        </Link>
      </div>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}

      <Section title="Schedule">
        <List
          empty="No timetable for this course."
          rows={timetable.map((r) => (
            <li key={String(r.id)} className="px-4 py-3 text-sm">
              {DAYS[Number(r.day_of_week)]} · {String(r.start_time)}–{String(r.end_time)}
              {r.venue ? ` · ${String(r.venue)}` : ""}
              {r.lecturer ? ` · ${String(r.lecturer)}` : ""}
            </li>
          ))}
        />
        <form onSubmit={addTimetable} className="mt-3 grid gap-2 sm:grid-cols-3">
          <select name="day_of_week" className="h-11 rounded-md border border-border bg-bg px-3 text-sm" defaultValue={1}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <Input name="start_time" type="time" required />
          <Input name="end_time" type="time" required />
          <Input name="venue" placeholder="Venue" />
          <Input name="lecturer" placeholder="Lecturer" />
          <Button type="submit">Add slot</Button>
        </form>
      </Section>

      <Section title="Tasks">
        <List
          empty="No tasks for this course."
          rows={tasks.map((t) => (
            <li key={String(t.id)} className="px-4 py-3 text-sm">
              <span className="font-medium">{String(t.title)}</span>
              {t.due_at ? (
                <span className="text-muted"> · due {new Date(String(t.due_at)).toLocaleString()}</span>
              ) : null}
            </li>
          ))}
        />
        <form onSubmit={addTask} className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input name="title" placeholder="Task title" required />
          <Input name="due_at" type="datetime-local" />
          <Input name="description" placeholder="Notes" className="sm:col-span-2" />
          <Button type="submit">Add task</Button>
        </form>
      </Section>

      <Section title="Exams">
        <List
          empty="No exams logged."
          rows={exams.map((e) => (
            <li key={String(e.id)} className="px-4 py-3 text-sm">
              {new Date(String(e.starts_at)).toLocaleString()}
              {e.venue ? ` · ${String(e.venue)}` : ""}
            </li>
          ))}
        />
        <form onSubmit={addExam} className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input name="title" placeholder="Exam title" />
          <Input name="starts_at" type="datetime-local" required />
          <Input name="venue" placeholder="Venue" />
          <Button type="submit">Add exam</Button>
        </form>
      </Section>

      <Section title="Syllabus topics">
        <List
          empty="No topics yet."
          rows={topics.map((t) => (
            <li key={String(t.id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>{String(t.title)}</span>
              <select
                className="h-9 rounded-md border border-border bg-bg px-2 text-xs"
                value={String(t.status)}
                onChange={(ev) => setTopicStatus(String(t.id), ev.target.value)}
              >
                {TOPIC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </li>
          ))}
        />
        <form onSubmit={addTopic} className="mt-3 flex flex-wrap gap-2">
          <Input name="title" placeholder="Topic title" required className="min-w-[200px] flex-1" />
          <Button type="submit">Add topic</Button>
        </form>
      </Section>

      <Section title="Course library">
        <List
          empty="No notes or links."
          rows={library.map((l) => (
            <li key={String(l.id)} className="px-4 py-3 text-sm">
              <span className="font-medium">{String(l.title)}</span>
              <span className="text-muted"> · {String(l.kind)}</span>
              {l.url ? (
                <a href={String(l.url)} className="ml-2 underline" target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : null}
            </li>
          ))}
        />
        <form onSubmit={addLibrary} className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input name="title" placeholder="Title" required />
          <select name="kind" className="h-11 rounded-md border border-border bg-bg px-3 text-sm">
            <option value="note">Note</option>
            <option value="link">Link</option>
            <option value="pdf">PDF ref</option>
          </select>
          <Input name="url" placeholder="URL (optional)" className="sm:col-span-2" />
          <textarea
            name="content"
            rows={2}
            placeholder="Content"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm sm:col-span-2"
          />
          <Button type="submit">Save item</Button>
        </form>
      </Section>

      <Section title="Topic mastery">
        <List
          empty="Track topics you are mastering."
          rows={mastery.map((m) => (
            <li key={String(m.id)} className="px-4 py-3 text-sm">
              {String(m.topic)} · {String(m.state)} · score {String(m.score)}
            </li>
          ))}
        />
        <form onSubmit={upsertMastery} className="mt-3 grid gap-2 sm:grid-cols-3">
          <Input name="topic" placeholder="Topic" required />
          <select name="state" className="h-11 rounded-md border border-border bg-bg px-3 text-sm">
            <option value="not_started">not started</option>
            <option value="in_progress">in progress</option>
            <option value="confident">confident</option>
            <option value="weak">weak</option>
          </select>
          <Input name="score" type="number" step="1" min={0} max={100} defaultValue={50} />
          <Button type="submit">Update mastery</Button>
        </form>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

function List({ empty, rows }: { empty: string; rows: React.ReactNode[] }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.length ? rows : <li className="px-4 py-3 text-sm text-muted">{empty}</li>}
    </ul>
  );
}
