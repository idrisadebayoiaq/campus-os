import { NextResponse } from "next/server";
import { getStudentCampus } from "@/lib/campus";
import { callStudyModel } from "@/lib/study/ai";
import { createClient } from "@/lib/supabase/server";

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
  const text = String(body.text || body.content || "").trim();
  if (!text || text.length < 20) {
    return NextResponse.json({ error: "Paste at least a few sentences to summarize." }, { status: 400 });
  }

  const result = await callStudyModel({
    supabase,
    userId: user.id,
    feature: "summarize",
    system:
      "Summarize study notes for a Nigerian university student. Use bullet points, key terms, and exam-style takeaways. Keep it under 400 words unless the input is very long.",
    messages: [{ role: "user", content: text.slice(0, 12000) }],
    campusLabel: `${campus.institutionName} · ${campus.campusName}`,
    courseLabel: body.course ? String(body.course) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    summary: result.content,
    model: result.model,
  });
}
