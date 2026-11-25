import { NextResponse } from "next/server";
import { getStudentCampus } from "@/lib/campus";
import { callStudyModel } from "@/lib/study/ai";
import { createRouteClient, getRouteUser } from "@/lib/supabase/route";

const PERSONALITY_PROMPTS: Record<string, string> = {
  friendly:
    "Be warm, encouraging, and patient. Celebrate small wins. Keep a conversational tone.",
  strict_tutor:
    "Be rigorous and exacting. Push the student to reason. Correct mistakes firmly but fairly.",
  concise:
    "Be brief and dense. Prefer bullets and short paragraphs. Skip fluff.",
};

const STYLE_PROMPTS: Record<string, string> = {
  simple: "Explain like a first-year student. Use everyday analogies.",
  balanced: "Clear explanations with one short example and a self-check question.",
  detailed: "Go deeper: steps, edge cases, and a worked example.",
};

export async function POST(request: Request) {
  const supabase = await createRouteClient(request);
  const { user } = await getRouteUser(request, supabase);
  if (!user) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const conversationId = String(body.conversationId || "").trim();
  const message = String(body.message || "").trim();
  if (!conversationId || !message) {
    return NextResponse.json(
      { error: "conversationId and message required" },
      { status: 400 },
    );
  }

  // Ensure participant
  const { data: part } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!part) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, kind")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.kind !== "ai") {
    return NextResponse.json({ error: "Not an AI conversation" }, { status: 400 });
  }

  const { data: companion } = await supabase
    .from("ai_companion_profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  const replyMode = companion?.reply_mode === "voice_only" ? "voice_only" : "text_only";
  const style = String(companion?.explanation_style || "balanced");
  const personality = String(companion?.personality || "friendly");
  const language = String(companion?.language || "auto");
  const notes = String(companion?.system_notes || "").trim();
  const saveHistory = companion?.save_history !== false;
  const speechRate = Number(companion?.speech_rate || 1) || 1;

  const campus = await getStudentCampus(supabase, user.id);

  let courseLabel: string | undefined;
  if (companion?.use_course_context !== false) {
    const { data: courses } = await supabase
      .from("student_courses")
      .select("code, title")
      .eq("user_id", user.id)
      .limit(8);
    if (courses?.length) {
      courseLabel = courses
        .map((c) => [c.code, c.title].filter(Boolean).join(" "))
        .join("; ");
    }
  }

  const history: { role: "user" | "assistant"; content: string }[] = [];
  if (saveHistory) {
    const { data: prior } = await supabase
      .from("messages")
      .select("body, sender_id, message_type, media_url")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(24);
    for (const row of [...(prior || [])].reverse()) {
      if (row.message_type === "system") continue;
      const role = row.sender_id === user.id ? "user" : "assistant";
      let content = row.body || "";
      if (row.message_type === "audio" && row.media_url?.startsWith("local-tts:")) {
        content = decodeURIComponent(row.media_url.replace("local-tts:", ""));
      }
      if (!content.trim() || content === "Voice message") continue;
      history.push({ role, content });
    }
  }

  // Drop the just-sent user message duplicate if client already inserted it
  if (
    history.length &&
    history[history.length - 1]?.role === "user" &&
    history[history.length - 1]?.content === message
  ) {
    // keep as-is; model needs it
  } else {
    history.push({ role: "user", content: message });
  }

  const system = [
    PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.friendly,
    STYLE_PROMPTS[style] || STYLE_PROMPTS.balanced,
    language && language !== "auto"
      ? `Prefer responding in language: ${language}.`
      : null,
    notes ? `Student notes: ${notes}` : null,
    companion?.display_name
      ? `Your display name in the chat is “${companion.display_name}”.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callStudyModel({
    supabase,
    userId: user.id,
    feature: "chat_companion",
    system,
    messages: history,
    campusLabel: campus
      ? `${campus.institutionName} · ${campus.campusName}`
      : undefined,
    courseLabel,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 502 },
    );
  }

  const content = result.content.trim();
  let speakLocally: string | undefined;

  if (replyMode === "voice_only") {
    const encoded = encodeURIComponent(content);
    const { data: audioMsg, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: null,
        message_type: "audio",
        body: "Voice message",
        media_url: `local-tts:${encoded}`,
        media_duration_ms: Math.min(120000, Math.max(2000, content.length * 60)),
      })
      .select("*")
      .single();
    if (error) {
      // fall back to text
      const { data: textMsg } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: null,
          message_type: "text",
          body: content,
        })
        .select("*")
        .single();
      return NextResponse.json({
        message: textMsg,
        model: result.model,
        replyMode: "text_only",
        voiceFallback: true,
      });
    }
    speakLocally = content;
    return NextResponse.json({
      message: audioMsg,
      model: result.model,
      replyMode,
      speakLocally,
      speechRate,
    });
  }

  const { data: textMsg, error: textError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: null,
      message_type: "text",
      body: content,
    })
    .select("*")
    .single();
  if (textError) {
    return NextResponse.json({ error: textError.message }, { status: 500 });
  }

  return NextResponse.json({
    message: textMsg,
    model: result.model,
    replyMode,
  });
}
