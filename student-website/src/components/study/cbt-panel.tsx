"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type QuizQ = {
  id?: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation?: string | null;
  topic?: string | null;
};

type Attempt = {
  id: string;
  correct: number;
  total: number;
  duration_seconds: number | null;
  created_at: string;
};

export function CbtPanel({
  savedQuestions,
  attempts,
  courseCode,
}: {
  savedQuestions: QuizQ[];
  attempts: Attempt[];
  courseCode?: string;
}) {
  const [questions, setQuestions] = useState<QuizQ[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [phase, setPhase] = useState<"setup" | "quiz" | "review">("setup");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [topic, setTopic] = useState(courseCode || "General");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== "quiz" || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase === "quiz" && secondsLeft === 0 && questions.length) {
      finishQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  async function loadSaved() {
    setQuestions(savedQuestions.slice(0, 10));
    startQuiz(savedQuestions.slice(0, 10).length * 60);
  }

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/study/ai/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, count: 5, course_code: courseCode }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Quiz generation failed.");
      return;
    }
    const qs = (json.questions || []) as QuizQ[];
    setQuestions(qs);
    startQuiz(qs.length * 90);
  }

  function startQuiz(duration: number) {
    setAnswers([]);
    setIndex(0);
    setSecondsLeft(duration);
    setPhase("quiz");
    setStartedAt(Date.now());
  }

  function pick(option: number) {
    const next = [...answers];
    next[index] = option;
    setAnswers(next);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      finishQuiz(next);
    }
  }

  async function finishQuiz(finalAnswers = answers) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let correct = 0;
    questions.forEach((q, i) => {
      if (finalAnswers[i] === q.correct_index) correct += 1;
    });

    const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : null;

    await supabase.from("cbt_attempts").insert({
      user_id: user.id,
      course_code: courseCode || null,
      total: questions.length,
      correct,
      duration_seconds: duration,
      answers: questions.map((q, i) => ({
        prompt: q.prompt,
        picked: finalAnswers[i] ?? null,
        correct_index: q.correct_index,
        explanation: q.explanation,
      })),
    });

    setPhase("review");
    setSecondsLeft(0);
  }

  const current = questions[index];

  return (
    <div className="space-y-6">
      {phase === "setup" ? (
        <div className="space-y-4 rounded-md border border-border p-4">
          <Field label="Topic / course focus">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={loadSaved} disabled={!savedQuestions.length}>
              Use saved questions ({savedQuestions.length})
            </Button>
            <Button type="button" variant="secondary" onClick={generate} disabled={loading}>
              {loading ? "Generating…" : "Generate with CampusOS AI"}
            </Button>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      ) : null}

      {phase === "quiz" && current ? (
        <div className="space-y-4 rounded-md border border-border p-5">
          <p className="text-sm text-muted">
            Q{index + 1}/{questions.length} · {secondsLeft}s left
          </p>
          <p className="font-medium">{current.prompt}</p>
          <div className="grid gap-2">
            {current.options.map((opt, i) => (
              <Button key={opt} type="button" variant="secondary" onClick={() => pick(i)}>
                {opt}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {phase === "review" ? (
        <div className="space-y-4">
          <p className="text-sm">
            Score:{" "}
            <span className="font-semibold tabular-nums">
              {answers.filter((a, i) => a === questions[i]?.correct_index).length}/{questions.length}
            </span>
          </p>
          {questions.map((q, i) => (
            <div key={q.id || i} className="rounded-md border border-border p-4 text-sm">
              <p className="font-medium">{q.prompt}</p>
              <p className="text-muted mt-1">
                Your pick: {answers[i] != null ? q.options[answers[i]] : "—"} · Correct:{" "}
                {q.options[q.correct_index]}
              </p>
              {q.explanation ? <p className="mt-2 text-muted">{q.explanation}</p> : null}
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setPhase("setup")}>
            New attempt
          </Button>
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">Recent attempts</h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {attempts.length ? (
            attempts.map((a) => (
              <div key={a.id} className="px-4 py-3 text-sm">
                {a.correct}/{a.total} correct
                {a.duration_seconds != null ? ` · ${a.duration_seconds}s` : ""} ·{" "}
                {new Date(a.created_at).toLocaleString()}
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted">No attempts yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
