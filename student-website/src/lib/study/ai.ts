import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CampusOS default study model: DeepSeek V4.1 Flash via OpenRouter.
 * Cheapest strong option for tutoring, summaries, quizzes, and long notes
 * (~$0.006 / $0.50 per 1M tokens) with large context + vision.
 */
export const CAMPUSOS_STUDY_MODEL =
  process.env.CAMPUSOS_STUDY_MODEL || "deepseek/deepseek-v4.1-flash";

export const FREE_AI_DAILY_CAP = Number(process.env.CAMPUSOS_AI_DAILY_CAP || 40);

const SAFETY = `You are CampusOS study AI — a learning aid for Nigerian tertiary students.
Never complete graded exams, continuous assessments, or take tests for the student.
Never help with exam impersonation. Prefer explanations, examples, and practice.
Label uncertainty. Keep answers clear and practical.`;

export async function checkAiCap(supabase: SupabaseClient, userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString());
  return (count || 0) < FREE_AI_DAILY_CAP;
}

export async function callStudyModel(opts: {
  supabase: SupabaseClient;
  userId: string;
  feature: string;
  system?: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  campusLabel?: string;
  courseLabel?: string;
}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return {
      ok: false as const,
      error: "CampusOS AI is not configured (OPENROUTER_API_KEY missing).",
    };
  }

  const allowed = await checkAiCap(opts.supabase, opts.userId);
  if (!allowed) {
    return {
      ok: false as const,
      error: `Daily free AI limit (${FREE_AI_DAILY_CAP}) reached. Try again tomorrow.`,
    };
  }

  const contextBits = [
    opts.campusLabel ? `Campus: ${opts.campusLabel}` : null,
    opts.courseLabel ? `Course: ${opts.courseLabel}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  const system = [SAFETY, contextBits, opts.system].filter(Boolean).join("\n\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_STUDENT_URL || "http://localhost:3000",
      "X-Title": "CampusOS Study",
    },
    body: JSON.stringify({
      model: CAMPUSOS_STUDY_MODEL,
      messages: [{ role: "system", content: system }, ...opts.messages],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false as const,
      error: "CampusOS could not reach the study model.",
      detail: text.slice(0, 400),
    };
  }

  const json = await response.json();
  const content =
    json?.choices?.[0]?.message?.content ||
    "No answer returned. Try a shorter question.";

  await opts.supabase.from("ai_usage_events").insert({
    user_id: opts.userId,
    feature: opts.feature,
    model: CAMPUSOS_STUDY_MODEL,
    prompt_tokens: json?.usage?.prompt_tokens || 0,
    completion_tokens: json?.usage?.completion_tokens || 0,
  });

  return {
    ok: true as const,
    content,
    model: CAMPUSOS_STUDY_MODEL,
  };
}

export const GRADE_POINTS_5: Record<string, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
  F: 0,
};

export function calcCgpa(
  grades: { credit_units: number; grade: string; grade_point?: number | null }[],
) {
  let points = 0;
  let credits = 0;
  for (const g of grades) {
    const gp =
      g.grade_point != null
        ? Number(g.grade_point)
        : GRADE_POINTS_5[g.grade.toUpperCase()];
    if (gp == null || Number.isNaN(gp)) continue;
    const units = Number(g.credit_units) || 0;
    points += gp * units;
    credits += units;
  }
  return {
    cgpa: credits ? points / credits : null,
    credits,
  };
}

export function targetNeeded(
  currentCgpa: number,
  currentCredits: number,
  targetCgpa: number,
  remainingCredits: number,
) {
  if (remainingCredits <= 0) return null;
  const need =
    (targetCgpa * (currentCredits + remainingCredits) -
      currentCgpa * currentCredits) /
    remainingCredits;
  return need;
}

export function finalNeeded(
  knownScore: number,
  knownWeight: number,
  targetOverall: number,
  finalWeight: number,
) {
  if (finalWeight <= 0) return null;
  return (targetOverall - knownScore * (knownWeight / 100)) / (finalWeight / 100);
}
