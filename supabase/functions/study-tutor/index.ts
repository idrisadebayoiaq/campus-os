// CampusOS AI Tutor: replies in the student's AI chat (conversations.kind = 'ai').
//
// Secret (Supabase › Edge Functions › Secrets):
//   OPENROUTER_API_KEY   – required
//   TUTOR_MODEL          – optional override (default: deepseek/deepseek-v4.1-flash)
//   TUTOR_FALLBACK_MODEL – optional override (default: qwen/qwen3.7-flash)
//
// The client has already saved the student's message; this function reads the chat,
// asks the model and stores the reply as an 'assistant' message.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("TUTOR_MODEL") || "deepseek/deepseek-v4.1-flash";
const FALLBACK = Deno.env.get("TUTOR_FALLBACK_MODEL") || "qwen/qwen3.7-flash";
const PERSONALITY: Record<string, string> = {
  friendly: "Warm, encouraging and patient, like a friendly older coursemate.",
  strict_tutor: "Direct and rigorous. Push the student to think; point out mistakes clearly but kindly.",
  concise: "Very brief. Give the answer first, then at most a few short lines of explanation.",
};
const STYLE: Record<string, string> = {
  simple: "Explain in the simplest words with everyday Nigerian examples. Avoid jargon.",
  balanced: "Explain clearly with one worked example when it helps.",
  detailed: "Explain step by step in depth, including the reasoning and common mistakes.",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Msg = { body: string | null; sender_id: string | null; message_type: string };

async function askModel(system: string, turns: { role: "user" | "assistant"; content: string }[]) {
  const key = Deno.env.get("OPENROUTER_API_KEY")?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("not_configured");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://campusos-app.vercel.app",
      "X-Title": "CampusOS Tutor",
    },
    body: JSON.stringify({
      model: MODEL,
      models: [MODEL, FALLBACK],
      messages: [{ role: "system", content: system }, ...turns],
      temperature: 0.5,
      max_tokens: 1400,
      // Keep thinking short so replies stay fast and cheap.
      reasoning: { effort: "low", exclude: true },
      provider: { sort: "price", allow_fallbacks: true },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`openrouter_${res.status}`, detail);
    // 401/402/403 mean the provider key or credit is the problem, not the student.
    throw new Error(res.status === 401 || res.status === 402 || res.status === 403 ? "provider_auth" : `model_${res.status}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new Error("empty");
  return {
    text: text.trim(),
    model: (data?.model as string) || MODEL,
    promptTokens: Number(data?.usage?.prompt_tokens ?? 0),
    completionTokens: Number(data?.usage?.completion_tokens ?? 0),
  };
}

// The chat shows plain text, so strip any markdown the model slips in.
function plain(text: string) {
  return text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in to use the AI tutor." }, 401);

  let body: { conversationId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) return json({ error: "Missing conversation" }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  try {
    const [{ data: conv }, { data: part }] = await Promise.all([
      admin.from("conversations").select("kind").eq("id", conversationId).maybeSingle(),
      admin
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (!conv || conv.kind !== "ai" || !part) return json({ error: "Chat not found" }, 404);

    const hour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: lastHour }, { count: lastDay }] = await Promise.all([
      admin
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("feature", "tutor")
        .gte("created_at", hour),
      admin
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("feature", "tutor")
        .gte("created_at", day),
    ]);
    // Limits: in-school students use the tutor free with a limit; Premium raises it.
    // Exam candidates need Premium for the tutor (it is part of their plan).
    const [{ data: premiumSet }, { data: kindRow }] = await Promise.all([
      admin.rpc("premium_ids", { p_ids: [user.id] }),
      admin.rpc("student_kind", { p_user: user.id }),
    ]);
    const isPremium = Array.isArray(premiumSet) && premiumSet.includes(user.id);
    const examPrep = kindRow === "exam_prep";
    const num = async (key: string, fallback: number) => {
      const { data } = await admin.rpc("setting_num", { p_key: key, p_default: fallback });
      return Math.max(1, Number(data ?? fallback));
    };
    if (examPrep && !isPremium) {
      return json(
        { error: "The AI tutor is part of Premium for exam candidates. Open Profile › Premium to unlock it.", code: "premium_required" },
        402,
      );
    }
    let perHour: number;
    let perDay: number;
    if (examPrep) {
      perHour = await num("tutor_exam_per_hour", 60);
      perDay = await num("tutor_exam_per_day", 200);
    } else {
      const mult = isPremium ? await num("tutor_premium_multiplier", 3) : 1;
      perHour = (await num("tutor_free_per_hour", 10)) * mult;
      perDay = (await num("tutor_free_per_day", 30)) * mult;
    }
    if ((lastHour ?? 0) >= perHour) {
      return json({ error: "You've asked a lot this hour. Take a short break and try again soon." + (isPremium ? "" : " Premium raises your limit."), code: "limit" }, 429);
    }
    if ((lastDay ?? 0) >= perDay) {
      return json({ error: "You've reached today's tutor limit. It resets tomorrow." + (isPremium ? "" : " Premium raises your limit."), code: "limit" }, 429);
    }

    const [{ data: profile }, { data: me }, { data: history }] = await Promise.all([
      admin
        .from("ai_companion_profiles")
        .select(
          "display_name, reply_mode, explanation_style, personality, language, use_course_context, system_notes",
        )
        .eq("conversation_id", conversationId)
        .maybeSingle(),
      admin.from("profiles").select("full_name, preferred_name, first_name").eq("id", user.id).maybeSingle(),
      admin
        .from("messages")
        .select("body, sender_id, message_type, created_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(16),
    ]);

    const turns = ((history ?? []) as Msg[])
      .reverse()
      .filter((m) => m.body?.trim() && m.message_type !== "system")
      .map((m) => ({
        role: (m.sender_id === user.id ? "user" : "assistant") as "user" | "assistant",
        content: m.body!.trim(),
      }));
    if (!turns.length || turns[turns.length - 1].role !== "user") {
      return json({ error: "Send a message first." }, 400);
    }

    let courses = "";
    if (profile?.use_course_context ?? true) {
      const { data } = await admin
        .from("student_courses")
        .select("code, title, status")
        .eq("user_id", user.id)
        .in("status", ["planned", "registered"])
        .limit(12);
      if (data?.length) {
        courses = data.map((c) => `${c.code} ${c.title}`.trim()).join("; ");
      }
    }

    let examContext = "";
    if (examPrep) {
      const { data: goals } = await admin
        .from("student_profiles")
        .select("exam_targets, exam_subjects, exam_date, target_course")
        .eq("user_id", user.id)
        .maybeSingle();
      const exams = (goals?.exam_targets ?? []).map((e: string) => e.toUpperCase().replace("_", "-")).join(", ");
      const subjects = (goals?.exam_subjects ?? []).join(", ");
      examContext = [
        `This student is preparing for ${exams || "a secondary-school or entrance exam"} and is not in school yet.`,
        subjects ? `Their subjects: ${subjects}.` : "",
        goals?.exam_date ? `Their exam date is ${goals.exam_date}.` : "",
        goals?.target_course ? `They want to study ${goals.target_course}.` : "",
        `Teach to the JAMB/WAEC/NECO syllabus. Prefer exam-style practice: give short multiple-choice questions with four options, wait for their answer, then explain. Point out common exam traps and time-saving tricks.`,
      ]
        .filter(Boolean)
        .join(" ");
    }

    const name = me?.preferred_name || me?.first_name || me?.full_name?.split(" ")[0] || "";
    const language = profile?.language && profile.language !== "auto" ? profile.language : "";

    const system = [
      `You are ${profile?.display_name || "CampusOS Tutor"}, a study tutor inside CampusOS, a campus app for Nigerian university and polytechnic students.`,
      name ? `The student's name is ${name}.` : "",
      `Personality: ${PERSONALITY[profile?.personality ?? "friendly"] ?? PERSONALITY.friendly}`,
      `Teaching style: ${STYLE[profile?.explanation_style ?? "balanced"] ?? STYLE.balanced}`,
      language
        ? `Reply in ${language}.`
        : "Reply in the language the student writes in (English or Nigerian Pidgin are both fine).",
      courses ? `Courses the student is taking this semester: ${courses}.` : "",
      examContext,
      `Help with studying: explain concepts, solve and check problems step by step, summarise notes, make practice questions, plan revision, and give exam tips.`,
      `Do not write the student's graded assignments or take-home exams for them; guide them to the answer instead. Say so briefly if asked.`,
      `If you are not sure about a fact, say so instead of guessing. Never invent references or statistics.`,
      `If the student seems stressed or in danger, be kind and suggest talking to someone they trust or the school's counselling unit.`,
      `Politely steer unrelated requests back to studying and student life.`,
      `FORMAT: the chat shows plain text only. No markdown, no headings, no asterisks, no tables. Use short paragraphs and numbered steps like "1)". Write maths in plain text (for example x^2 + 3x = 10, sqrt(16) = 4). Keep replies under about 250 words unless the student asks for more detail.`,
      profile?.system_notes ? `The student asked you to remember: ${String(profile.system_notes).slice(0, 500)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let answer;
    try {
      answer = await askModel(system, turns.slice(-14));
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      const text =
        code === "not_configured" || code === "provider_auth"
          ? "The AI tutor is temporarily unavailable. We're fixing it, please try again later."
          : "The tutor is busy right now. Please try again in a moment.";
      return json({ error: text }, code === "not_configured" || code === "provider_auth" ? 503 : 502);
    }

    const reply = plain(answer.text);
    const { data: saved, error: saveError } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: null,
        message_type: "assistant",
        body: reply,
      })
      .select("id, conversation_id, body, sender_id, created_at, edited_at, deleted_at, message_type, media_url, media_duration_ms, client_id")
      .single();
    if (saveError || !saved) throw saveError ?? new Error("Could not save the reply");

    await Promise.all([
      admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId),
      admin.from("ai_usage_events").insert({
        user_id: user.id,
        feature: "tutor",
        model: answer.model,
        prompt_tokens: answer.promptTokens,
        completion_tokens: answer.completionTokens,
      }),
    ]);

    return json({
      message: saved,
      speakLocally: profile?.reply_mode === "voice_only" ? reply.slice(0, 1200) : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message;
    return json({ error: message || "Something went wrong" }, 500);
  }
});
