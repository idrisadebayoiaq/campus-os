"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

const GRADE_POINTS: Record<string, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
  F: 0,
};

type Timetable = {
  id: string;
  course_code: string;
  course_title: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  venue: string | null;
};

type Task = {
  id: string;
  title: string;
  course_code: string | null;
  due_at: string | null;
  is_done: boolean;
};

type Grade = {
  id: string;
  course_code: string;
  credit_units: number;
  grade: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SchoolTools({
  timetable,
  tasks,
  grades,
}: {
  timetable: Timetable[];
  tasks: Task[];
  grades: Grade[];
}) {
  const [status, setStatus] = useState<string | null>(null);

  const cgpa = useMemo(() => {
    let points = 0;
    let credits = 0;
    for (const g of grades) {
      const gp = GRADE_POINTS[g.grade.toUpperCase()];
      if (gp == null) continue;
      points += gp * Number(g.credit_units);
      credits += Number(g.credit_units);
    }
    return credits ? (points / credits).toFixed(2) : "—";
  }, [grades]);

  async function addTimetable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("timetable_entries").insert({
      user_id: user.id,
      course_code: String(form.get("course_code")),
      course_title: String(form.get("course_title") || "") || null,
      day_of_week: Number(form.get("day_of_week")),
      start_time: String(form.get("start_time")),
      end_time: String(form.get("end_time")),
      venue: String(form.get("venue") || "") || null,
    });
    setStatus(error ? error.message : "Class added. Refresh to see it.");
    if (!error) event.currentTarget.reset();
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("academic_tasks").insert({
      user_id: user.id,
      title: String(form.get("title")),
      course_code: String(form.get("course_code") || "") || null,
      due_at: String(form.get("due_at") || "") || null,
    });
    setStatus(error ? error.message : "Task added. Refresh to see it.");
    if (!error) event.currentTarget.reset();
  }

  async function addGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("grade_entries").insert({
      user_id: user.id,
      course_code: String(form.get("course_code")),
      credit_units: Number(form.get("credit_units") || 1),
      grade: String(form.get("grade")).toUpperCase(),
    });
    setStatus(error ? error.message : "Grade saved. Refresh for CGPA.");
    if (!error) event.currentTarget.reset();
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Timetable</h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {timetable.length ? (
            timetable.map((row) => (
              <div key={row.id} className="px-4 py-3 text-sm">
                <p className="font-medium">
                  {DAYS[row.day_of_week]} · {row.course_code}
                </p>
                <p className="text-muted">
                  {row.start_time}–{row.end_time}
                  {row.venue ? ` · ${row.venue}` : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted">No classes yet.</p>
          )}
        </div>
        <form onSubmit={addTimetable} className="grid gap-3 sm:grid-cols-3">
          <Input name="course_code" placeholder="Course code" required />
          <Input name="course_title" placeholder="Title" />
          <select name="day_of_week" className="h-11 rounded-md border border-border bg-bg px-3 text-sm" defaultValue={1}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <Input name="start_time" type="time" required />
          <Input name="end_time" type="time" required />
          <Input name="venue" placeholder="Venue" />
          <Button type="submit">Add class</Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Deadlines</h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {tasks.length ? (
            tasks.map((task) => (
              <div key={task.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{task.title}</p>
                <p className="text-muted">
                  {task.course_code || "General"}
                  {task.due_at ? ` · due ${new Date(task.due_at).toLocaleString()}` : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted">No tasks yet.</p>
          )}
        </div>
        <form onSubmit={addTask} className="grid gap-3 sm:grid-cols-3">
          <Input name="title" placeholder="Assignment title" required />
          <Input name="course_code" placeholder="Course" />
          <Input name="due_at" type="datetime-local" />
          <Button type="submit">Add task</Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">CGPA calculator</h2>
        <p className="text-sm text-muted">
          Unofficial estimate only. Current CGPA: <span className="font-medium text-fg">{cgpa}</span>
        </p>
        <div className="divide-y divide-border rounded-md border border-border">
          {grades.map((g) => (
            <div key={g.id} className="px-4 py-3 text-sm">
              {g.course_code} · {g.credit_units} units · {g.grade}
            </div>
          ))}
        </div>
        <form onSubmit={addGrade} className="grid gap-3 sm:grid-cols-4">
          <Input name="course_code" placeholder="Course" required />
          <Input name="credit_units" type="number" step="0.5" defaultValue={3} required />
          <Input name="grade" placeholder="A-F" required />
          <Button type="submit">Add grade</Button>
        </form>
      </section>

      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
