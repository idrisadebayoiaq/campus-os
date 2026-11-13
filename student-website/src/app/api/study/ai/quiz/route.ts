import { NextResponse } from "next/server";
import { getStudentCampus } from "@/lib/campus";
import { callStudyModel } from "@/lib/study/ai";
import { createClient } from "@/lib/supabase/server";

type QuizItem = {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  topic?: string;
};

function parseQuizJson(raw: string): QuizItem[] {
  const trimmed = raw.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = jsonBlock ? jsonBlock[1].trim() : trimmed;
  const parsed = JSON.parse(payload);
  const list = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(list)) return [];
  return list
    .map((q: Record<string, unknown>) => {
      const options = Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [];
      while (options.length < 4) options.push(`Option ${options.length + 1}`);
      return {
        prompt: String(q.prompt || q.question || ""),
        options,
        correct_index: Math.min(3, Math.max(0, Number(q.correct_index ?? q.correctIndex ?? 0))),
        explanation: String(q.explanation || ""),
        topic: q.topic ? String(q.topic) : undefined,
      };
    })
    .filter((q) => q.prompt.length > 5);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const campus = await getStudentCampus(supabase, user.id);
  if (!campus) {
    return NextResponse.json({ error: "Choose your campus in onboarding first." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const topic = String(body.topic || body.course || "General revision").trim();
  const count = Math.min(15, Math.max(3, Number(body.count) || 5));
  const courseId = body.course_id ? String(body.course_id) : null;
  const courseCode = body.course_code ? String(body.course_code) : null;

  const result = await callStudyModel({
    supabase,
    userId: user.id,
    feature: "quiz_generate",
    system: `Generate exactly ${count} multiple-choice practice questions (NOT real exam leaks).
Return ONLY valid JSON — an array of objects with keys: prompt, options (array of 4 strings), correct_index (0-3), explanation, topic.
No markdown outside the JSON.`,
    messages: [
      {
        role: "user",
        content: `Topic/course: ${topic}. Campus context: ${campus.institutionName}. Difficulty: undergraduate.`,
      },
    ],
    campusLabel: `${campus.institutionName} · ${campus.campusName}`,
    courseLabel: courseCode || topic,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  let questions: QuizItem[] = [];
  try {
    questions = parseQuizJson(result.content);
  } catch {
    return NextResponse.json(
      { error: "CampusOS could not parse quiz JSON. Try again with a narrower topic." },
      { status: 502 },
    );
  }

  if (!questions.length) {
    return NextResponse.json({ error: "No questions generated." }, { status: 502 });
  }

  const rows = questions.map((q) => ({
    user_id: user.id,
    course_id: courseId,
    course_code: courseCode,
    prompt: q.prompt,
    options: q.options,
    correct_index: q.correct_index,
    explanation: q.explanation || null,
    topic: q.topic || topic,
  }));

  const { data: inserted, error } = await supabase.from("quiz_questions").insert(rows).select("id, prompt, options, correct_index, explanation, topic");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    questions: inserted ?? questions,
    model: result.model,
  });
}
