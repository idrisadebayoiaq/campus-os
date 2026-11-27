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
        max_tokens: 2400,
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
      generationConfig: { temperature: 0.5, maxOutputTokens: 2400 },
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
      max_tokens: 2400,
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
      max_tokens: 2400,
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
      const hard = data.filter((c) => Number(c.difficulty) >= 4).map((c) => c.code || c.title);
      if (hard.length) lines.push(`They find these hard: ${hard.join(", ")}.`);
    }
  }
  return { text: lines.filter(Boolean).join(" "), programme: programme || department, school, examPrep };
}

const PLAIN_FORMAT = `FORMAT: the chat shows plain text only. No markdown, no headings, no asterisks, no tables. Use short paragraphs and numbered steps like "1)". Write maths in plain text (for example x^2 + 3x = 10, sqrt(16) = 4). Keep replies under about 250 words unless the student asks for more detail.`;

const RICH_FORMAT = `FORMAT: the app renders Markdown, so write every reply as a clean, well-spaced, easy-to-scan answer:
1. Open with the direct answer or a one or two line summary. Never start with filler like "Great question".
2. Use short paragraphs (1 to 3 sentences) separated by a blank line. Never write a wall of text.
3. For anything longer than a few lines, split it into sections with "## " headings (for example ## Idea, ## Steps, ## Example, ## Quick recap). Skip headings for short answers.
4. Use numbered lists for steps and "- " bullets for points. Put **bold** on key terms and important numbers.
5. Put definitions, formulas, rules, key takeaways, memory tricks and warnings in a blockquote that starts with a bold label, for example:
> **Definition:** a stack is a last-in, first-out data structure.
> **Remember:** the exam loves this one.
6. Use a Markdown table whenever you compare things, list a timetable or plan, or show terms with meanings (header row, then a |---|---| row, short cells, at most 5 columns).
7. Use a diagram when a process, cycle, hierarchy or relationship is easier to see than to read. Write it in a fenced block:
\`\`\`flow
Question -> Plan -> Solve -> Check
\`\`\`
one chain per line using "->" (at most 8 short steps per chain), or
\`\`\`mindmap
Photosynthesis
  Inputs
    Water
    Carbon dioxide
  Outputs
    Glucose
    Oxygen
\`\`\`
with the topic on the first line and sub-topics indented by two spaces. Never use mermaid or any other diagram syntax.
8. Show maths step by step, one step per line, inside a plain fenced block (no language), in plain text such as x^2 + 3x = 10 or sqrt(16) = 4. Never use LaTeX or dollar signs.
9. No HTML and no images. Use at most one emoji, and only when it genuinely helps.
10. Length: a simple question gets under 120 words; an explanation about 200 to 300 words; plans, tables and worked solutions can be as long as they need. When useful, finish with one short next step or question.`;

const PLAN_RULES = `STUDY PLANS: when the student asks for a study plan, revision timetable, what to do first, or how to handle deadlines, you MUST build it from THE STUDENT'S REAL SCHEDULE below instead of generic advice.
- Start with a short "What I found" summary: number of classes, the nearest deadlines and exams, and anything overdue.
- Never put study in a class slot or live class. Use free gaps between classes, evenings and weekends.
- Protect sleep (no study from 11 PM to 6 AM), meals and at least one lighter evening or rest block.
- Order work by deadline first, then by hard courses and exam dates. Finish each assignment a day before it is due, and mark OVERDUE items as urgent.
- Use focused sessions of 25 to 50 minutes with short breaks, and include a short revision of the day's classes.
- If something clashes (two deadlines on one day, an exam right after a class), point it out and say how you handled it.
- Present the plan as a Markdown table with the columns Day | Time | Focus | What to do. Default to the next 7 days starting today (Nigeria time) unless they ask for another range. Only list days that have something.
- After the table, add a short "Priorities" list and one blockquote tip. Offer to adjust for their free hours, or to turn it into a daily or exam-countdown plan. They can save the sessions in Study > Planner.
- Use only the facts below. If a time or date is missing, say so rather than inventing it.
THE STUDENT'S REAL SCHEDULE (accurate and current):`;

// ---- Schedule awareness: lets the tutor build a plan from the student's real week ----

const PLAN_INTENT =
  /\b(plan|planner|planning|schedule|timetable|time[\s-]?table|revision|revise|routine|deadline|deadlines|due|assignment|assignments|exam|exams|test|tests|prioriti[sz]e|organi[sz]e|manage my time|catch up|my (classes|lectures|week)|what (should|do) i (study|read|do|focus)|how (do|should) i (prepare|start|study))\b/i;

const LAGOS = "Africa/Lagos";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function lagosWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(",", "");
}

function lagosNow() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

function inDays(iso: string) {
  const hours = (new Date(iso).getTime() - Date.now()) / 3600000;
  if (hours < 0) return "OVERDUE";
  if (hours < 24) return "due within 24 hours";
  return `in ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"}`;
}

const hm = (t?: string | null) => String(t ?? "").slice(0, 5);

async function scheduleContext(admin: Admin, userId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const horizon = new Date(now.getTime() + 28 * 86400000).toISOString();

  const [timetable, tasks, enrolled, exams, blocks, sessions] = await Promise.all([
    admin
      .from("timetable_entries")
      .select("course_code, course_title, day_of_week, start_time, end_time, venue, lecturer")
      .eq("user_id", userId)
      .order("day_of_week")
      .order("start_time"),
    admin
      .from("academic_tasks")
      .select("title, course_code, due_at, priority, description")
      .eq("user_id", userId)
      .eq("is_done", false)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(20),
    admin.from("class_enrollments").select("class_id, status").eq("student_user_id", userId),
    admin
      .from("exam_entries")
      .select("course_code, title, starts_at, venue")
      .eq("user_id", userId)
      .gte("starts_at", nowIso)
      .lte("starts_at", horizon)
      .order("starts_at")
      .limit(12),
    admin
      .from("study_plan_blocks")
      .select("title, starts_at, ends_at, kind")
      .eq("user_id", userId)
      .gte("ends_at", nowIso)
      .lte("starts_at", new Date(now.getTime() + 14 * 86400000).toISOString())
      .order("starts_at")
      .limit(20),
    admin
      .from("study_sessions")
      .select("minutes")
      .eq("user_id", userId)
      .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString()),
  ]);

  const classIds = (enrolled.data ?? [])
    .filter((e) => !["removed", "dropped", "left", "declined", "rejected"].includes(String(e.status)))
    .map((e) => e.class_id);

  // deno-lint-ignore no-explicit-any
  let lectureAssignments: any[] = [];
  // deno-lint-ignore no-explicit-any
  let live: any[] = [];
  if (classIds.length) {
    const [assign, subs, sess] = await Promise.all([
      admin
        .from("class_assignments")
        .select("id, title, due_at, max_score, class_offerings(course_code, course_title)")
        .in("class_id", classIds)
        .gte("due_at", new Date(now.getTime() - 3 * 86400000).toISOString())
        .lte("due_at", horizon)
        .order("due_at")
        .limit(20),
      admin.from("class_assignment_submissions").select("assignment_id").eq("student_user_id", userId),
      admin
        .from("class_live_sessions")
        .select("title, scheduled_at, ends_at, mode, status, class_offerings(course_code)")
        .in("class_id", classIds)
        .gte("scheduled_at", nowIso)
        .lte("scheduled_at", new Date(now.getTime() + 14 * 86400000).toISOString())
        .neq("status", "cancelled")
        .order("scheduled_at")
        .limit(12),
    ]);
    const done = new Set((subs.data ?? []).map((s) => s.assignment_id));
    lectureAssignments = (assign.data ?? []).filter((a) => !done.has(a.id));
    live = sess.data ?? [];
  }

  const lines: string[] = [];
  const entries = timetable.data ?? [];
  if (entries.length) {
    lines.push("WEEKLY CLASS TIMETABLE (repeats every week):");
    for (const t of entries) {
      lines.push(
        `- ${DOW[t.day_of_week] ?? "?"} ${hm(t.start_time)}-${hm(t.end_time)} ${t.course_code ?? ""} ${t.course_title ?? ""}`.trim() +
          `${t.venue ? ` at ${t.venue}` : ""}${t.lecturer ? ` (${t.lecturer})` : ""}`,
      );
    }
  } else {
    lines.push("WEEKLY CLASS TIMETABLE: none saved yet (they can add it in Study > Timetable).");
  }

  const personal = (tasks.data ?? []).map(
    (t) =>
      `- ${t.course_code ? `${t.course_code}: ` : ""}${t.title}${t.due_at ? `, due ${lagosWhen(t.due_at)} (${inDays(t.due_at)})` : ", no due date"}${t.priority ? `, priority ${t.priority}` : ""}${t.description ? ` - ${String(t.description).slice(0, 100)}` : ""}`,
  );
  const fromClass = lectureAssignments.map((a) => {
    const c = Array.isArray(a.class_offerings) ? a.class_offerings[0] : a.class_offerings;
    return `- ${c?.course_code ? `${c.course_code}: ` : ""}${a.title} (set by lecturer, not submitted yet), due ${lagosWhen(a.due_at)} (${inDays(a.due_at)})`;
  });
  if (personal.length || fromClass.length) {
    lines.push("", "ASSIGNMENTS AND TASKS NOT DONE YET:", ...fromClass, ...personal);
  } else {
    lines.push("", "ASSIGNMENTS AND TASKS NOT DONE YET: none recorded.");
  }

  if (exams.data?.length) {
    lines.push(
      "",
      "UPCOMING EXAMS AND TESTS:",
      ...exams.data.map((x) => `- ${x.course_code ? `${x.course_code} ` : ""}${x.title ?? "Exam"}, ${lagosWhen(x.starts_at)} (${inDays(x.starts_at)})${x.venue ? ` at ${x.venue}` : ""}`),
    );
  }
  if (live.length) {
    lines.push(
      "",
      "UPCOMING LIVE ONLINE CLASSES:",
      ...live.map((s) => {
        const c = Array.isArray(s.class_offerings) ? s.class_offerings[0] : s.class_offerings;
        return `- ${c?.course_code ? `${c.course_code} ` : ""}${s.title}, ${lagosWhen(s.scheduled_at)}`;
      }),
    );
  }
  if (blocks.data?.length) {
    lines.push(
      "",
      "STUDY BLOCKS THEY ALREADY PLANNED (do not double-book these):",
      ...blocks.data.map((b) => `- ${lagosWhen(b.starts_at)} to ${lagosWhen(b.ends_at)}: ${b.title}`),
    );
  }
  const mins = (sessions.data ?? []).reduce((n, s) => n + Number(s.minutes ?? 0), 0);
  lines.push("", `STUDY TIME LOGGED IN THE LAST 7 DAYS: ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} minutes`}.`);

  return {
    text: lines.join("\n"),
    empty: !entries.length && !personal.length && !fromClass.length && !exams.data?.length,
  };
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

// New app versions render markdown (tables, quotes, diagrams): only tidy it.
function tidy(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Older app versions show plain text, so strip any markdown the model slips in.
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

  let body: { conversationId?: string; action?: string; rich?: boolean } = {};
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
  const rich = body.rich === true;

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

    // Pull the real timetable, assignments and exams only when they are asking about plans or deadlines.
    const lastAsked = turns
      .filter((t) => t.role === "user")
      .slice(-2)
      .map((t) => t.content)
      .join(" \n ");
    const planning = action === "reply" && PLAN_INTENT.test(lastAsked);
    const sched = planning ? await scheduleContext(admin, user.id).catch(() => null) : null;

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
      rich ? RICH_FORMAT : PLAIN_FORMAT,
      planning && sched ? PLAN_RULES : "",
      planning && sched ? `${sched.text}` : "",
      planning && sched?.empty
        ? "The student has saved almost nothing in the app yet. Say so kindly in one line, tell them they can add classes in Study > Timetable and tasks in Study > Assignments, then still give a sensible starter plan and ask for their free hours and deadlines."
        : "",
      `Current date and time in Nigeria: ${lagosNow()}.`,
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
        greeting = rich ? tidy(out.text) : plain(out.text);
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

    const reply = rich ? tidy(answer.text) : plain(answer.text);
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
      speakLocally: profile?.reply_mode === "voice_only" ? plain(reply).slice(0, 3900) : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message;
    return json({ error: message || "Something went wrong" }, 500);
  }
});
