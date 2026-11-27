// CampusOS AI Tutor: replies in the student's AI chat (conversations.kind = 'ai').
//
// Secret (Supabase › Edge Functions › Secrets):
//   GROQ_API_KEY         – used first (https://console.groq.com/keys)
//   GROQ_TUTOR_MODEL     – optional (default: openai/gpt-oss-20b)
//   OPENROUTER_API_KEY   – used only if Groq is not set
//   TUTOR_MODEL          – optional OpenRouter override
//
// The client has already saved the student's message; this function reads the chat,
// asks the model and stores the reply as an 'assistant' message.
// action "welcome" writes a personal first greeting in an empty chat.
// A multipart upload (file + conversationId) is a voice note: Groq Whisper turns it into text.

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

type Turn = { role: "user" | "assistant"; content: string };
type Answer = { text: string; model: string; promptTokens: number; completionTokens: number };

const secret = (name: string) => Deno.env.get(name)?.trim().replace(/^["']|["']$/g, "") || "";

// Tries every configured provider in order, so one dead key does not take the tutor down.
async function askModel(system: string, turns: Turn[]): Promise<Answer> {
  const attempts: { name: string; run: () => Promise<Answer> }[] = [];
  if (secret("GROQ_API_KEY")) attempts.push({ name: "groq", run: () => askGroq(system, turns) });
  if (secret("GEMINI_API_KEY")) attempts.push({ name: "gemini", run: () => askGemini(system, turns) });
  if (secret("OPENAI_API_KEY")) attempts.push({ name: "openai", run: () => askOpenAI(system, turns) });
  if (secret("OPENROUTER_API_KEY")) attempts.push({ name: "openrouter", run: () => askOpenRouter(system, turns) });
  if (!attempts.length) throw new Error("not_configured");
  console.log("tutor_providers", attempts.map((a) => a.name).join(","));

  let lastError = "model_error";
  for (const a of attempts) {
    try {
      return await a.run();
    } catch (e) {
      lastError = e instanceof Error ? e.message : "model_error";
      console.error(`tutor_provider_failed ${a.name} ${lastError}`);
    }
  }
  throw new Error(lastError);
}

async function askGroq(system: string, turns: Turn[]): Promise<Answer> {
  const key = secret("GROQ_API_KEY");
  const models = [
    Deno.env.get("GROQ_TUTOR_MODEL") || "openai/gpt-oss-20b",
    Deno.env.get("GROQ_TUTOR_FALLBACK") || "llama-3.1-8b-instant",
  ];
  let last = "model_error";
  for (const model of models) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        max_tokens: 1400,
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
    if (res.status === 401 || res.status === 403) {
      console.error(`groq_${res.status}`, (await res.text().catch(() => "")).slice(0, 200));
      throw new Error("provider_auth");
    }
    if (!res.ok) {
      last = `model_${res.status}`;
      console.error(`groq_${res.status} ${model}`, (await res.text().catch(() => "")).slice(0, 200));
      continue;
    }
    const data = await res.json();
    const message = data?.choices?.[0]?.message;
    const text: string | undefined = message?.content;
    if (!text?.trim()) {
      last = "empty";
      continue;
    }
    return {
      text: text.trim(),
      model: (data?.model as string) || model,
      promptTokens: Number(data?.usage?.prompt_tokens ?? 0),
      completionTokens: Number(data?.usage?.completion_tokens ?? 0),
    };
  }
  throw new Error(last);
}

async function askGemini(system: string, turns: Turn[]): Promise<Answer> {
  const key = secret("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_TUTOR_MODEL") || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.content }] })),
      generationConfig: { temperature: 0.5, maxOutputTokens: 1400 },
    }),
  });
  if (!res.ok) {
    console.error(`gemini_${res.status}`, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error(res.status === 400 || res.status === 401 || res.status === 403 ? "provider_auth" : `model_${res.status}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text?.trim()) throw new Error("empty");
  return {
    text: text.trim(),
    model: model,
    promptTokens: Number(data?.usageMetadata?.promptTokenCount ?? 0),
    completionTokens: Number(data?.usageMetadata?.candidatesTokenCount ?? 0),
  };
}

async function askOpenAI(system: string, turns: Turn[]): Promise<Answer> {
  const key = secret("OPENAI_API_KEY");
  const base = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = Deno.env.get("OPENAI_TUTOR_MODEL") || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 1400,
      messages: [{ role: "system", content: system }, ...turns],
    }),
  });
  if (!res.ok) {
    console.error(`openai_${res.status}`, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error(res.status === 401 || res.status === 402 || res.status === 403 ? "provider_auth" : `model_${res.status}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new Error("empty");
  return {
    text: text.trim(),
    model: (data?.model as string) || model,
    promptTokens: Number(data?.usage?.prompt_tokens ?? 0),
    completionTokens: Number(data?.usage?.completion_tokens ?? 0),
  };
}

async function askOpenRouter(system: string, turns: Turn[]): Promise<Answer> {
  const key = secret("OPENROUTER_API_KEY");
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
    // Key length and prefix only (never the key) so a wrong or truncated secret is easy to spot.
    console.error(`openrouter_${res.status}`, detail, `key_len=${key.length} key_prefix=${key.slice(0, 8)}`);
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

type Admin = ReturnType<typeof createClient>;

// Everything the tutor should know about what the student studies.
async function studyContext(admin: Admin, userId: string, examPrep: boolean, useCourses: boolean) {
  const [{ data: sp }, { data: enrol }] = await Promise.all([
    admin
      .from("student_profiles")
      .select(
        "academic_level, programme_name, department_name, faculty_name, programme_type, current_semester, study_mode, current_cgpa, target_cgpa, exam_targets, exam_subjects, exam_date, target_school, target_course",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("student_enrollments")
      .select("institutions(name, short_name), campuses(name), programmes(name), departments(name)")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // deno-lint-ignore no-explicit-any
  const e = (enrol ?? {}) as any;
  const school = e.institutions?.name || e.institutions?.short_name || "";
  const programme = sp?.programme_name || e.programmes?.name || "";
  const department = sp?.department_name || e.departments?.name || "";
  const lines: string[] = [];

  if (examPrep) {
    const exams = (sp?.exam_targets ?? []).map((x: string) => x.toUpperCase().replace("_", "-")).join(", ");
    const subjects = (sp?.exam_subjects ?? []).join(", ");
    lines.push(
      `The student is preparing for ${exams || "a secondary-school or entrance exam"} and is not in university yet.`,
      subjects ? `Exam subjects: ${subjects}.` : "",
      sp?.exam_date ? `Exam date: ${sp.exam_date}.` : "",
      sp?.target_course ? `They want to study ${sp.target_course}${sp?.target_school ? ` at ${sp.target_school}` : ""}.` : "",
      "Teach to the JAMB/WAEC/NECO syllabus. Prefer exam-style practice: short multiple-choice questions with four options, wait for their answer, then explain. Point out common exam traps and time-saving tricks.",
    );
  } else {
    const level = sp?.academic_level ? `${String(sp.academic_level).replace(/l$/i, "")}L` : "";
    const who = [level, programme || department].filter(Boolean).join(" ");
    lines.push(
      who || school ? `The student is a ${who || "student"}${school ? ` at ${school}` : ""}${e.campuses?.name ? ` (${e.campuses.name})` : ""}.` : "",
      department && programme && department !== programme ? `Department: ${department}.` : "",
      sp?.faculty_name ? `Faculty: ${sp.faculty_name}.` : "",
      sp?.current_semester ? `Current semester: ${sp.current_semester}.` : "",
      sp?.current_cgpa ? `CGPA ${sp.current_cgpa}${sp?.target_cgpa ? `, aiming for ${sp.target_cgpa}` : ""}.` : "",
      "Pitch explanations at their level and use examples from their field of study when it helps.",
    );
  }

  if (useCourses) {
    const { data } = await admin
      .from("student_courses")
      .select("code, title, difficulty")
      .eq("user_id", userId)
      .in("status", ["planned", "registered"])
      .limit(14);
    if (data?.length) {
      lines.push(`Courses this semester: ${data.map((c) => `${c.code ?? ""} ${c.title ?? ""}`.trim()).join("; ")}.`);
      const hard = data.filter((c) => c.difficulty === "hard").map((c) => c.code || c.title);
      if (hard.length) lines.push(`They find these hard: ${hard.join(", ")}.`);
    }
  }
  return { text: lines.filter(Boolean).join(" "), programme: programme || department, school, examPrep };
}

async function transcribe(file: File) {
  const key = secret("GROQ_API_KEY");
  if (!key) throw new Error("not_configured");
  const form = new FormData();
  form.append("file", file, file.name || "voice.m4a");
  form.append("model", Deno.env.get("GROQ_STT_MODEL") || "whisper-large-v3-turbo");
  form.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    console.error(`groq_stt_${res.status}`, (await res.text().catch(() => "")).slice(0, 200));
    throw new Error("stt_failed");
  }
  const data = await res.json();
  return String(data?.text ?? "").trim();
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

  let body: { conversationId?: string; action?: string } = {};
  let audio: File | null = null;
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      audio = file instanceof File ? file : null;
      body = { conversationId: String(form.get("conversationId") ?? ""), action: "transcribe" };
    } else {
      body = await req.json();
    }
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) return json({ error: "Missing conversation" }, 400);
  const action = body.action === "welcome" || body.action === "transcribe" ? body.action : "reply";

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

    if (action === "transcribe") {
      if (!audio || audio.size < 800) return json({ error: "That voice note was too short." }, 400);
      if (audio.size > 15 * 1024 * 1024) return json({ error: "Keep voice notes under 5 minutes." }, 400);
      try {
        const text = await transcribe(audio);
        if (!text) return json({ error: "Couldn't hear anything. Try again closer to the mic." }, 422);
        return json({ text });
      } catch {
        return json({ error: "Voice notes aren't available right now. Type your question instead." }, 503);
      }
    }

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
    if (action === "reply" && (lastHour ?? 0) >= perHour) {
      return json({ error: "You've asked a lot this hour. Take a short break and try again soon." + (isPremium ? "" : " Premium raises your limit."), code: "limit" }, 429);
    }
    if (action === "reply" && (lastDay ?? 0) >= perDay) {
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
    if (action === "welcome") {
      // Greet once, only in a chat with no questions or replies yet.
      if (turns.length) return json({ skipped: true });
    } else if (!turns.length || turns[turns.length - 1].role !== "user") {
      return json({ error: "Send a message first." }, 400);
    }
    const firstQuestion = action === "reply" && turns.filter((t) => t.role === "user").length === 1;

    const ctx = await studyContext(admin, user.id, examPrep, profile?.use_course_context ?? true);
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
      ctx.text ? `ABOUT THE STUDENT: ${ctx.text}` : "",
      "Always use what you know about the student: tie answers to their course of study, level and courses (or exam subjects), and pick examples from their field.",
      firstQuestion
        ? "This is their first question to you: greet them by name in a few words, then answer with their programme and level in mind."
        : "",
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

    if (action === "welcome") {
      const subject = ctx.examPrep ? "their exam subjects" : ctx.programme || "their courses";
      let greeting = "";
      try {
        const out = await askModel(system, [
          {
            role: "user",
            content: `(Not from the student.) Write your first message to ${name || "the student"}: one short friendly greeting by name, one line showing you know what they study (${ctx.text || subject}), then offer three specific things you can help with right now for ${subject}, each on its own line starting with "1)", "2)", "3)". Under 70 words. No questions about what they study.`,
          },
        ]);
        greeting = plain(out.text);
      } catch {
        // A template greeting is better than none.
      }
      if (!greeting) {
        greeting = [
          `Hi${name ? ` ${name}` : ""}! I'm ${profile?.display_name || "your CampusOS tutor"}.`,
          ctx.examPrep
            ? "I'll help you prepare for your exams with practice questions and quick explanations."
            : `I'll help you with ${ctx.programme || "your courses"}: explanations, past questions and revision plans.`,
          "Ask me anything, or send a voice note.",
        ].join(" ");
      }
      const { data: hello } = await admin
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: null, message_type: "assistant", body: greeting })
        .select("id, conversation_id, body, sender_id, created_at, edited_at, deleted_at, message_type, media_url, media_duration_ms, client_id")
        .single();
      return json({ message: hello });
    }

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
      speakLocally: profile?.reply_mode === "voice_only" ? reply.slice(0, 3900) : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message;
    return json({ error: message || "Something went wrong" }, 500);
  }
});
