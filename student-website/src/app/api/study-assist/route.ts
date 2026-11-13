import { NextResponse } from "next/server";
import { getStudentCampus } from "@/lib/campus";
import { callStudyModel } from "@/lib/study/ai";
import { createClient } from "@/lib/supabase/server";

/** Legacy alias — prefer /api/study/ai/tutor */
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
    return NextResponse.json(
      { error: "Choose your campus first so CampusOS can keep answers school-scoped." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  }

  const result = await callStudyModel({
    supabase,
    userId: user.id,
    feature: "study_assist_legacy",
    messages: [{ role: "user", content: prompt }],
    campusLabel: `${campus.institutionName} · ${campus.campusName}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    answer: result.content,
    model: result.model,
    campus: `${campus.institutionName} · ${campus.campusName}`,
  });
}
