// CampusOS Assistant: answers support questions from the knowledge base and the
// asker's own account, and hands the chat to the support team when it can't.
//
// Optional secrets (Supabase › Edge Functions › Secrets):
//   GEMINI_API_KEY                       – use Google Gemini
//   OPENAI_API_KEY [+ AI_BASE_URL]       – any OpenAI-compatible API
//   AI_MODEL                             – override the model name
// Without a key the assistant answers with the best-matching help article.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIES = [
  "account", "verification", "housing", "food", "marketplace", "payments",
  "business_setup", "listings", "classes", "technical", "safety", "other",
] as const;

const WELCOME =
  "Hi! I'm the CampusOS Assistant. Ask me anything about your account, housing, orders, verification or the Portal. If I can't sort it out, I'll pass you to a person on the support team.";

const WANTS_HUMAN =
  /\b(human|real person|talk to (a |an )?(person|human|someone|agent|staff)|speak (to|with) (a |an )?(person|human|someone|agent)|customer (care|service)|live agent)\b/i;
const SENSITIVE =
  /\b(scam(med)?|fraud|stolen|stole|hack(ed)?|harass(ed|ment)?|threat(en)?|assault|abuse|refund|charged twice|double charge|chargeback|lost money|police|lawyer|delete my (account|data))\b/i;
const URGENT = /\b(assault|threat(en)?|danger|unsafe|emergency|police)\b/i;
const GREETING = /^\s*(hi|hello|hey|good (morning|afternoon|evening)|yo|hola|thanks?( you)?|ok(ay)?)[\s!.?]*$/i;

type Audience = "student" | "business" | "lecturer" | "school" | "other";
type Article = { id: string; title: string; body: string; category: string; rank: number };
type Msg = { id: string; body: string; sender_id: string | null; message_type: string; created_at: string };
type Decision = {
  reply: string;
  handoff: boolean;
  subject?: string;
  category?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  summary?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function ensureConversation(admin: SupabaseClient, userId: string) {
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("kind", "assistant")
    .eq("created_by", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: conv, error } = await admin
    .from("conversations")
    .insert({ kind: "assistant", subject: "CampusOS Assistant", created_by: userId })
    .select("id")
    .single();
  if (error || !conv) throw error ?? new Error("Could not start the assistant");
  await admin.from("conversation_participants").insert({
    conversation_id: conv.id,
    user_id: userId,
    role: "member",
    last_read_at: new Date().toISOString(),
  });
  await admin.from("messages").insert({
    conversation_id: conv.id,
    sender_id: null,
    message_type: "assistant",
    body: WELCOME,
  });
  return conv.id as string;
}

async function recentMessages(admin: SupabaseClient, conversationId: string, limit = 60) {
  const { data } = await admin
    .from("messages")
    .select("id, body, sender_id, message_type, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Msg[]).reverse();
}

async function accountContext(admin: SupabaseClient, userId: string, audience: Audience) {
  const lines: string[] = [];
  try {
    if (audience === "business" || audience === "other") {
      const [{ data: apps }, { data: biz }] = await Promise.all([
        admin
          .from("business_applications")
          .select("business_name, business_type, status, decision_reason, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(3),
        admin
          .from("business_profiles")
          .select("display_name, business_type, setup_complete, is_active, verification_label")
          .eq("owner_user_id", userId)
          .limit(3),
      ]);
      for (const a of apps ?? []) {
        lines.push(
          `Business application "${a.business_name}" (${a.business_type}): status ${a.status}` +
            (a.decision_reason ? `, reviewer note: ${a.decision_reason}` : ""),
        );
      }
      for (const b of biz ?? []) {
        lines.push(
          `Business profile "${b.display_name}": setup ${b.setup_complete ? "complete" : "not finished"}, ` +
            `${b.is_active ? "active" : "inactive"}` +
            (b.verification_label ? `, label ${b.verification_label}` : ""),
        );
      }
    }
    if (audience === "student") {
      const [{ data: ver }, { data: insp }, { data: orders }] = await Promise.all([
        admin
          .from("student_verifications")
          .select("status, review_note, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1),
        admin
          .from("inspection_requests")
          .select("status, preferred_at, provider_note, created_at")
          .eq("student_id", userId)
          .order("created_at", { ascending: false })
          .limit(3),
        admin
          .from("food_orders")
          .select("status, total, created_at")
          .eq("student_id", userId)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      const v = ver?.[0];
      lines.push(
        v
          ? `Student ID verification: ${v.status}${v.review_note ? ` (note: ${v.review_note})` : ""}`
          : "Student ID verification: not submitted yet",
      );
      for (const i of insp ?? []) {
        lines.push(`Inspection request from ${String(i.created_at).slice(0, 10)}: ${i.status}`);
      }
      for (const o of orders ?? []) {
        lines.push(`Food order from ${String(o.created_at).slice(0, 10)}: ${o.status}, total ${o.total}`);
      }
    }
    const { count } = await admin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", userId)
      .neq("status", "resolved");
    if (count) lines.push(`Open support tickets: ${count}`);
  } catch {
    // Context is a bonus; answer without it.
  }
  return lines;
}

function guessCategory(text: string, articles: Article[]): string {
  const t = text.toLowerCase();
  if (SENSITIVE.test(t) && /scam|fraud|harass|threat|assault|abuse|stolen|stole/.test(t)) return "safety";
  if (/refund|charge|paystack|payment|payout|billing/.test(t)) return "payments";
  if (/verif|student id|matric/.test(t)) return "verification";
  if (/password|login|log in|sign ?up|account|email/.test(t)) return "account";
  if (/room|hostel|housing|inspection|agent|rent/.test(t)) return "housing";
  if (/food|order|restaurant|menu/.test(t)) return "food";
  if (/application|apply|setup|cac/.test(t)) return "business_setup";
  if (/listing|property|photo/.test(t)) return "listings";
  if (/crash|bug|error|not working|update/.test(t)) return "technical";
  return articles[0]?.category && (CATEGORIES as readonly string[]).includes(articles[0].category)
    ? articles[0].category
    : "other";
}

function transcriptOf(history: Msg[], userId: string) {
  return history
    .filter((m) => m.body?.trim())
    .slice(-20)
    .map((m) => `${m.sender_id === userId ? "User" : "Assistant"}: ${m.body.trim()}`)
    .join("\n");
}

async function askModel(input: {
  audience: Audience;
  articles: Article[];
  context: string[];
  history: Msg[];
  userId: string;
  question: string;
}): Promise<{ decision: Decision; model: string } | null> {
  const gemini = Deno.env.get("GEMINI_API_KEY");
  const openai = Deno.env.get("OPENAI_API_KEY");
  if (!gemini && !openai) return null;

  const system = [
    `You are the CampusOS Assistant, the first line of customer support for CampusOS, a campus app in Nigeria.`,
    `You are talking to a ${input.audience === "student" ? "student using the mobile app" : "business, lecturer or school user of the CampusOS Portal"}.`,
    `Answer ONLY from the help articles and account facts below. Never invent policies, prices, timelines or features.`,
    `Set "handoff": true when the articles don't cover the question, when it involves money, refunds, safety, harassment, fraud, account access you can't fix with the articles, data deletion, or when the user asks for a person or is frustrated.`,
    `Keep "reply" friendly, plain text, under 120 words, with short steps where helpful. No markdown headings.`,
    `Reply with JSON only: {"reply": string, "handoff": boolean, "subject": short ticket subject, "category": one of ${CATEGORIES.join("|")}, "priority": "normal"|"high"|"urgent", "summary": one or two sentences for the support agent}.`,
    ``,
    `HELP ARTICLES:`,
    ...(input.articles.length
      ? input.articles.map((a, i) => `[${i + 1}] ${a.title}\n${a.body}`)
      : ["(none matched)"]),
    ``,
    `ACCOUNT FACTS:`,
    ...(input.context.length ? input.context : ["(none)"]),
  ].join("\n");

  const turns = input.history
    .filter((m) => m.body?.trim() && m.message_type !== "system")
    .slice(-12)
    .map((m) => ({ role: m.sender_id === input.userId ? "user" : "assistant", text: m.body }));

  try {
    if (gemini) {
      const model = Deno.env.get("AI_MODEL") || "gemini-2.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gemini}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: turns.map((t) => ({
              role: t.role === "user" ? "user" : "model",
              parts: [{ text: t.text }],
            })),
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? { decision: JSON.parse(text) as Decision, model } : null;
    }

    const base = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          ...turns.map((t) => ({ role: t.role, content: t.text })),
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return text ? { decision: JSON.parse(text) as Decision, model } : null;
  } catch {
    return null;
  }
}

function searchAnswer(question: string, articles: Article[]): Decision {
  if (GREETING.test(question)) {
    return {
      reply: /thank/i.test(question)
        ? "You're welcome! Ask me anything else, or tap \"Talk to a person\" if you need the support team."
        : "Hello! What do you need help with? You can ask about your account, housing, orders, verification or the Portal.",
      handoff: false,
    };
  }
  const top = articles[0];
  if (!top || top.rank < 0.3) {
    return { reply: "", handoff: true };
  }
  const more = articles
    .slice(1, 3)
    .filter((a) => a.rank >= 0.3)
    .map((a) => `• ${a.title}`);
  return {
    reply:
      `${top.title}\n\n${top.body}` +
      (more.length ? `\n\nRelated: \n${more.join("\n")}` : "") +
      `\n\nDid that answer your question? If not, tap "Talk to a person".`,
    handoff: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in to use support" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  let body: { action?: string; message?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = open
  }
  const action = body.action ?? "open";

  try {
    const conversationId = await ensureConversation(admin, user.id);

    if (action === "open") {
      return json({ conversationId, messages: await recentMessages(admin, conversationId) });
    }

    const { data: audienceData } = await admin.rpc("support_audience_for", { p_user: user.id });
    const audience = (audienceData as Audience) || "other";
    const kbAudience = audience === "student" ? "student" : audience === "other" ? "all" : "business";

    if (action === "send") {
      const question = String(body.message ?? "").trim().slice(0, 2000);
      if (!question) return json({ error: "Type a message first" }, 400);

      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recent } = await admin
        .from("support_ai_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);
      if ((recent ?? 0) >= 60) {
        return json({ error: "You've sent a lot of messages this hour. Tap \"Talk to a person\" and the team will help." }, 429);
      }

      const { data: userMsg, error: insertError } = await admin
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, message_type: "text", body: question })
        .select("id, body, sender_id, message_type, created_at")
        .single();
      if (insertError || !userMsg) throw insertError ?? new Error("Could not send");

      const [{ data: found }, history, context] = await Promise.all([
        admin.rpc("search_support_articles", { p_query: question, p_audience: kbAudience, p_limit: 4 }),
        recentMessages(admin, conversationId, 24),
        accountContext(admin, user.id, audience),
      ]);
      const articles = (found ?? []) as Article[];

      let decision: Decision;
      let mode: "ai" | "search" = "search";
      const forced = WANTS_HUMAN.test(question) || SENSITIVE.test(question);
      if (forced) {
        decision = { reply: "", handoff: true };
      } else {
        const ai = await askModel({ audience, articles, context, history, userId: user.id, question });
        if (ai) {
          decision = ai.decision;
          mode = "ai";
        } else {
          decision = searchAnswer(question, articles);
        }
      }

      let ticket: { id: string; number: number; conversation_id: string } | null = null;
      let replyText = String(decision.reply ?? "").trim();

      if (decision.handoff) {
        const category =
          decision.category && (CATEGORIES as readonly string[]).includes(decision.category)
            ? decision.category
            : guessCategory(question, articles);
        const priority = URGENT.test(question)
          ? "urgent"
          : SENSITIVE.test(question)
            ? "high"
            : decision.priority ?? null;
        const { data: created, error: ticketError } = await admin.rpc("create_support_ticket", {
          p_requester: user.id,
          p_subject: decision.subject || question.slice(0, 90),
          p_message: question,
          p_category: category,
          p_priority: priority,
          p_source: "assistant",
          p_summary: decision.summary || null,
          p_transcript: transcriptOf(history, user.id),
        });
        if (ticketError || !created) throw ticketError ?? new Error("Could not create ticket");
        ticket = created as { id: string; number: number; conversation_id: string };
        replyText =
          (replyText && mode === "ai" ? `${replyText}\n\n` : "") +
          `I've passed this to the CampusOS support team — ticket #${ticket.number}. ` +
          `A person will reply in the ticket chat and you'll get a notification.`;
      }

      const { data: botMsg } = await admin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: null,
          message_type: "assistant",
          body: replyText || "Sorry, I didn't catch that. Could you say it another way?",
        })
        .select("id, body, sender_id, message_type, created_at")
        .single();

      await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      await admin.from("support_ai_runs").insert({
        conversation_id: conversationId,
        user_id: user.id,
        question,
        reply: botMsg?.body ?? replyText,
        mode,
        handed_off: Boolean(ticket),
        ticket_id: ticket?.id ?? null,
        article_ids: articles.map((a) => a.id),
      });

      return json({ conversationId, messages: [userMsg, botMsg].filter(Boolean), ticket });
    }

    if (action === "handoff") {
      const history = await recentMessages(admin, conversationId, 24);
      const lastQuestion = [...history].reverse().find((m) => m.sender_id === user.id)?.body ?? "";
      const note = String(body.message ?? "").trim();
      const { data: found } = await admin.rpc("search_support_articles", {
        p_query: lastQuestion || note || "help",
        p_audience: kbAudience,
        p_limit: 1,
      });
      const { data: created, error: ticketError } = await admin.rpc("create_support_ticket", {
        p_requester: user.id,
        p_subject: (note || lastQuestion || "Asked to talk to a person").slice(0, 90),
        p_message: note || lastQuestion || "I'd like to talk to a person.",
        p_category: guessCategory(`${note} ${lastQuestion}`, (found ?? []) as Article[]),
        p_priority: SENSITIVE.test(`${note} ${lastQuestion}`) ? "high" : null,
        p_source: "assistant",
        p_summary: "User tapped \"Talk to a person\" in the assistant chat.",
        p_transcript: transcriptOf(history, user.id),
      });
      if (ticketError || !created) throw ticketError ?? new Error("Could not create ticket");
      const ticket = created as { id: string; number: number; conversation_id: string };
      const { data: botMsg } = await admin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: null,
          message_type: "assistant",
          body: `Done — ticket #${ticket.number} is with the support team. A person will reply in the ticket chat and you'll get a notification.`,
        })
        .select("id, body, sender_id, message_type, created_at")
        .single();
      await admin.from("support_ai_runs").insert({
        conversation_id: conversationId,
        user_id: user.id,
        question: note || lastQuestion || "(talk to a person)",
        reply: botMsg?.body ?? null,
        mode: "search",
        handed_off: true,
        ticket_id: ticket.id,
      });
      return json({ conversationId, messages: botMsg ? [botMsg] : [], ticket });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message;
    return json({ error: message || "Something went wrong" }, 500);
  }
});
