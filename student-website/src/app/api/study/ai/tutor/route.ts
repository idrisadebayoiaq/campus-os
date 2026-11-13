import { NextResponse } from "next/server";
import { getStudentCampus } from "@/lib/campus";
import { callStudyModel } from "@/lib/study/ai";
import { createClient } from "@/lib/supabase/server";

const MODE_PROMPTS: Record<string, string> = {
  explain:
    "Explain the concept clearly with simple language and one short analogy. End with a quick self-check question.",
  examples:
    "Give 2–3 worked examples increasing in difficulty. Show steps. Do not solve graded exam papers.",
  practice:
    "Give 3 short practice questions without full answers first; then provide hints and finally brief solutions.",
  step: `Teach Me Step-by-Step mode: Do NOT dump the full answer upfront.
Ask one guiding question at a time. Wait for the student to reason (they reply in chat).
After each student message, check understanding briefly, correct misconceptions, then ask the next guiding question.
When the student shows understanding, summarize what they learned in 2–3 bullets.`,
};

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
  const mode = String(body.mode || "explain").toLowerCase();
  const prompt = String(body.prompt || body.message || "").trim();
  const courseLabel = body.course ? String(body.course) : undefined;
  const history = Array.isArray(body.messages) ? body.messages : [];

  if (!prompt && history.length === 0) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const modeSystem = MODE_PROMPTS[mode] || MODE_PROMPTS.explain;
  const messages: { role: "user" | "assistant"; content: string }[] = history
    .slice(-12)
    .map((m: { role?: string; content?: string }) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(m.content || ""),
    }))
    .filter((m: { content: string }) => m.content.trim());

  if (prompt) {
    messages.push({ role: "user", content: prompt });
  }

  const result = await callStudyModel({
    supabase,
    userId: user.id,
    feature: `tutor_${mode}`,
    system: modeSystem,
    messages,
    campusLabel: `${campus.institutionName} · ${campus.campusName}`,
    courseLabel,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: "detail" in result ? result.detail : undefined }, { status: 502 });
  }

  return NextResponse.json({
    content: result.content,
    model: result.model,
    mode,
  });
}
