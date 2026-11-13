"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { calcCgpa, finalNeeded, GRADE_POINTS_5, targetNeeded } from "@/lib/study/ai";
import { createClient } from "@/lib/supabase/client";

type Grade = {
  id: string;
  course_code: string;
  credit_units: number;
  grade: string;
  grade_point: number | null;
};

type CourseOpt = { id: string; code: string };

export function CgpaPanel({ grades: initial, courses }: { grades: Grade[]; courses: CourseOpt[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [targetCgpa, setTargetCgpa] = useState("4.5");
  const [remainingCredits, setRemainingCredits] = useState("30");
  const [knownScore, setKnownScore] = useState("65");
  const [knownWeight, setKnownWeight] = useState("30");
  const [targetOverall, setTargetOverall] = useState("70");
  const [finalWeight, setFinalWeight] = useState("70");

  const { cgpa, credits } = useMemo(() => calcCgpa(initial), [initial]);

  const targetGpaNeeded = useMemo(() => {
    if (cgpa == null) return null;
    return targetNeeded(cgpa, credits, Number(targetCgpa), Number(remainingCredits));
  }, [cgpa, credits, targetCgpa, remainingCredits]);

  const finalScoreNeeded = useMemo(
    () =>
      finalNeeded(
        Number(knownScore),
        Number(knownWeight),
        Number(targetOverall),
        Number(finalWeight),
      ),
    [knownScore, knownWeight, targetOverall, finalWeight],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const grade = String(form.get("grade")).toUpperCase();
    const courseId = String(form.get("course_id") || "") || null;
    const course = courses.find((c) => c.id === courseId);

    const { error } = await supabase.from("grade_entries").insert({
      user_id: user.id,
      course_id: courseId,
      course_code: course?.code || String(form.get("course_code")),
      credit_units: Number(form.get("credit_units") || 3),
      grade,
      grade_point: GRADE_POINTS_5[grade] ?? null,
      semester: String(form.get("semester") || "") || null,
    });

    setStatus(error ? error.message : "Grade saved.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        Unofficial CGPA:{" "}
        <span className="text-lg font-semibold text-fg tabular-nums">
          {cgpa != null ? cgpa.toFixed(2) : "—"}
        </span>{" "}
        ({credits} units)
      </p>

      <div className="divide-y divide-border rounded-md border border-border">
        {initial.length ? (
          initial.map((g) => (
            <div key={g.id} className="px-4 py-3 text-sm">
              {g.course_code} · {g.credit_units}u · {g.grade}
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-muted">Add grades to calculate CGPA.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-3">
        <Field label="Course">
          <select name="course_id" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="">Manual</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course code">
          <Input name="course_code" required placeholder="CSC 201" />
        </Field>
        <Field label="Units">
          <Input name="credit_units" type="number" step="0.5" defaultValue={3} required />
        </Field>
        <Field label="Grade">
          <Input name="grade" required placeholder="A" />
        </Field>
        <Field label="Semester">
          <Input name="semester" placeholder="Harmattan 2025" />
        </Field>
        <Button type="submit">Add grade</Button>
        {status ? <p className="text-sm text-muted sm:col-span-3">{status}</p> : null}
      </form>

      <section className="rounded-md border border-border p-4 space-y-3">
        <h2 className="font-medium">Target CGPA planner</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Target CGPA">
            <Input value={targetCgpa} onChange={(e) => setTargetCgpa(e.target.value)} type="number" step="0.01" />
          </Field>
          <Field label="Remaining credit units">
            <Input
              value={remainingCredits}
              onChange={(e) => setRemainingCredits(e.target.value)}
              type="number"
            />
          </Field>
        </div>
        <p className="text-sm text-muted">
          Average GPA needed on remaining credits:{" "}
          <span className="font-medium text-fg tabular-nums">
            {targetGpaNeeded != null ? targetGpaNeeded.toFixed(2) : "—"}
          </span>
        </p>
      </section>

      <section className="rounded-md border border-border p-4 space-y-3">
        <h2 className="font-medium">Final exam projection</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Known score %">
            <Input value={knownScore} onChange={(e) => setKnownScore(e.target.value)} type="number" />
          </Field>
          <Field label="Known weight %">
            <Input value={knownWeight} onChange={(e) => setKnownWeight(e.target.value)} type="number" />
          </Field>
          <Field label="Target overall %">
            <Input value={targetOverall} onChange={(e) => setTargetOverall(e.target.value)} type="number" />
          </Field>
          <Field label="Final weight %">
            <Input value={finalWeight} onChange={(e) => setFinalWeight(e.target.value)} type="number" />
          </Field>
        </div>
        <p className="text-sm text-muted">
          Score needed on final:{" "}
          <span className="font-medium text-fg tabular-nums">
            {finalScoreNeeded != null ? finalScoreNeeded.toFixed(1) + "%" : "—"}
          </span>
        </p>
      </section>
    </div>
  );
}
