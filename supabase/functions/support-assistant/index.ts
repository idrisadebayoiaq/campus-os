// CampusOS Assistant: answers support questions from the knowledge base and the
// asker's own account, and hands the chat to the support team when it can't.
//
// Secrets (Supabase › Edge Functions › Secrets):
//   OPENROUTER_API_KEY                   – recommended; uses SUPPORT_MODEL below
//   SUPPORT_MODEL / SUPPORT_FALLBACK_MODEL – optional overrides
//   GEMINI_API_KEY, or OPENAI_API_KEY [+ AI_BASE_URL] – alternatives; AI_MODEL overrides
// Without any key the assistant answers with the best-matching help article.

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
// Only these send the chat straight to a person. Questions about money (refunds, fees, payouts)
// are answered by the assistant, which hands off by itself when staff need to act.
const SENSITIVE =
  /\b(scam(med)?|fraud|stolen|stole|hack(ed)?|harass(ed|ment)?|threat(en)?|assault|abuse|charged twice|double charge|chargeback|lost money|police|lawyer|delete my (account|data))\b/i;

// A how-to platform guide so the assistant can answer about every part of CampusOS,
// not only the questions that have a help article. Keep it factual; fees come live from settings.
const PLATFORM_GUIDE = `
CAMPUSOS PLATFORM GUIDE
CampusOS is a campus app in Nigeria. Students use the mobile app. Businesses, lecturers and school staff use the web Portal.

STUDENT APP (bottom bar: Home, Housing, Market, AI, and a More menu with Profile, Settings, Chat, Past Questions, Classes, Lecturer tools)
- Home: calendar card, small wallet balance card (tap to open the wallet), AI Study card, study tools, nearby deals.
- Housing: browse rooms near your location, open a room to see photos, price, agent, request an inspection, message the agent. "My room & rent" is under Profile.
- Market / Explore: food vendors and the student marketplace. Food orders and marketplace purchases are paid from the wallet.
- Wallet (Home wallet card or Profile > My wallet): a debit-card style card with name, linked card last 4 digits and balance. Actions: Add money, History, Purchases, Premium. Recent activity shows the latest 5 transactions with See all. A second card, "Request payout", appears for students who sell: shows what they can withdraw to a bank or to their wallet.
- Transactions: full history with filters by type (Funding, Purchases, Refunds, Sales, Withdrawals) and date.
- Paying by card (wallet top-up, Premium, card orders): a secure Paystack card form slides up inside the app; the result (success or failed) shows before closing. Cards: Mastercard, Visa, Verve.
- Premium (Profile > Premium): green badge, higher AI tutor limits, lower marketplace fee, priority support. Pay by card (saved for auto-renew) or wallet. Early access to deals is coming soon.
- Marketplace escrow: buyer pays from wallet, money is held, seller accepts, they meet and the buyer gives a 6-digit code, seller marks handed over, buyer confirms or disputes, then payment is released. Buyers cannot simply cancel after the seller accepts; they open a dispute and support rules on it.
- Study hub: Courses, Timetable, Classes, Assignments, Exams, Calendar, Planner, CGPA, Library, Past questions (own notes), Flashcards, CBT practice log, Focus timer, AI Tutor, Study groups, Tutors, Insights.
- Study lock (Settings > Study lock): pick a time; study tools stay open while distracting screens (chat, marketplace, housing, food, wallet) are covered and notifications are held until it ends.
- AI tutor: a chat in the app for study questions, with hourly and daily limits (Premium triples them). Settings > AI tutor changes its name and avatar.
- Verify student ID: Profile > Verify student ID, upload ID or admission letter; reviewed by the school or CampusOS.
- Settings: edit profile, login and password, campus, location, housing preferences, theme, notifications, help and support, terms and privacy. Delete account is requested through support.
- Help & support: this assistant first, then a person (ticket) when needed.

PORTAL (web, for businesses, lecturers, school staff, support and admins)
- Business types: housing agent/landlord, restaurant/food vendor, campus service, marketplace seller. Each sees only its own tools after approval.
- Apply, then finish the setup wizard (details, photos, bank, delivery) after approval.
- Housing: properties and units, inspection requests, tenancies, payment requests. Food: menu manager, orders board, pause orders, delivery zones. Marketplace: listings and orders.
- Money pages: Plan (monthly Business plan, auto-renew card), Payouts (add verified bank, withdraw available balance, history), Payment requests (needs an active plan).
- Also: Reviews with replies, Deals, Boosts, Insights (needs plan), Team members (needs plan), Inbox, Support.
- Lecturers: classes, roster, timetable, announcements. School authority: verify students, departments, approve lecturers.
- Staff: Support desk for agents; Admin for approvals, users, reports.

RULES OF THUMB
- Students sign up only in the mobile app. The Portal is not for student accounts.
- Wallet money cannot be withdrawn or sent to other people; seller earnings can be withdrawn.
- Never ask for or accept passwords, card numbers or PINs in chat.
- Study questions (maths, essays, exam prep) belong to the AI tutor, not to support.
`;
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

/** Current prices and limits, read live so answers never go stale. */
async function liveSettings(admin: SupabaseClient): Promise<string[]> {
  try {
    const { data } = await admin.from("platform_settings").select("key, value");
    const s: Record<string, unknown> = {};
    for (const r of data ?? []) s[(r as { key: string }).key] = (r as { value: unknown }).value;
    const n = (k: string, d: number) => Number(s[k] ?? d);
    const naira = (v: number) => `₦${v.toLocaleString("en-NG")}`;
    return [
      `Wallet top-up: ${naira(n("topup_min", 500))} to ${naira(n("topup_max", 100000))} each time; wallet holds up to ${naira(n("wallet_cap", 200000))}. The card fee is shown before paying and is paid by the student.`,
      `Student Premium: ${naira(n("student_plan_price", 1000))}/month. Marketplace fee ${n("marketplace_commission_pct", 2)}% (${n("marketplace_commission_premium_pct", 1)}% for Premium). AI tutor limits x${n("tutor_premium_multiplier", 3)} for Premium.`,
      `Business: Plan ${naira(n("business_plan_price", 3000))}/month (${n("plan_grace_days", 3)}-day grace). Commission: food orders ${n("food_commission_pct", 3)}%, rent ${n("rent_commission_pct", 5)}%. Minimum payout ${naira(n("payout_min", 5000))}.`,
      `Marketplace: seller accepts within ${n("market_accept_hours", 24)}h, handover within ${n("market_handover_days", 5)} days, auto-release ${n("market_release_hours", 48)}h after handover is marked, smallest order ${naira(n("market_min", 500))}.`,
    ];
  } catch {
    return [];
  }
}

async function accountContext(admin: SupabaseClient, userClient: SupabaseClient, userId: string, audience: Audience) {
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
          .select("id, display_name, business_type, setup_complete, is_active, verification_label")
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
        const { data: plan } = await userClient.rpc("business_plan_state", { p_business: b.id });
        const ps = plan as { active?: boolean; ends_at?: string | null; in_grace?: boolean } | null;
        if (ps) {
          lines.push(
            `Business plan for "${b.display_name}": ${ps.active ? `active until ${String(ps.ends_at ?? "").slice(0, 10)}` : "not active"}${ps.in_grace ? " (in grace period)" : ""}`,
          );
        }
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

      const [wallet, premium, seller, market, pending] = await Promise.all([
        admin.from("wallets").select("balance, status").eq("user_id", userId).maybeSingle(),
        userClient.rpc("my_premium_state"),
        userClient.rpc("my_seller_summary"),
        admin
          .from("market_orders")
          .select("title, amount, status, created_at, buyer_id")
          .or(`buyer_id.eq.${userId},seller_user_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(3),
        admin
          .from("payment_ledger")
          .select("purpose, amount, status, created_at")
          .eq("user_id", userId)
          .in("status", ["pending", "failed"])
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      if (wallet.data) {
        lines.push(`Wallet balance: ₦${Number(wallet.data.balance ?? 0).toLocaleString("en-NG")}${wallet.data.status === "frozen" ? " (wallet is on hold)" : ""}`);
      }
      const pr = premium.data as { active?: boolean; ends_at?: string | null; auto_renew?: boolean } | null;
      if (pr) {
        lines.push(
          pr.active
            ? `Premium: active until ${String(pr.ends_at ?? "").slice(0, 10)}, auto-renew ${pr.auto_renew ? "on" : "off"}`
            : "Premium: not active",
        );
      }
      const sl = seller.data as { is_seller?: boolean; available?: number; on_hold?: number } | null;
      if (sl?.is_seller) {
        lines.push(`Seller earnings: ₦${Number(sl.available ?? 0).toLocaleString("en-NG")} available, ₦${Number(sl.on_hold ?? 0).toLocaleString("en-NG")} on hold`);
      }
      for (const m of market.data ?? []) {
        lines.push(`Marketplace order "${m.title}" (${m.buyer_id === userId ? "you bought" : "you sold"}): ${m.status}, ₦${Number(m.amount).toLocaleString("en-NG")}, ${String(m.created_at).slice(0, 10)}`);
      }
      for (const p of pending.data ?? []) {
        lines.push(`Card payment (${p.purpose}) of ₦${Number(p.amount).toLocaleString("en-NG")} on ${String(p.created_at).slice(0, 10)}: ${p.status}`);
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
  settings: string[];
  history: Msg[];
  userId: string;
  question: string;
}): Promise<{ decision: Decision; model: string } | null> {
  const openrouter = Deno.env.get("OPENROUTER_API_KEY");
  const gemini = Deno.env.get("GEMINI_API_KEY");
  const openai = Deno.env.get("OPENAI_API_KEY");
  if (!openrouter && !gemini && !openai) return null;

  const system = [
    `You are the CampusOS Assistant, the first line of customer support for CampusOS, a campus app in Nigeria.`,
    `You are talking to a ${input.audience === "student" ? "student using the mobile app" : "business, lecturer or school user of the CampusOS Portal"}.`,
    `You know the whole platform. Answer from the PLATFORM GUIDE, LIVE PRICES, HELP ARTICLES and ACCOUNT FACTS below. Use the account facts to give answers about THIS user (their balance, orders, plan, status) and say exactly which screen to open.`,
    `Never invent prices, fees, timelines, features or policies that are not written below. If something isn't covered, say you aren't sure instead of guessing.`,
    `Answer how-to, fee, wallet, payment, Premium, marketplace, housing, food, study-tool and Portal questions yourself, step by step, even when money is involved. Only set "handoff": true when a person must act: a specific missing or wrong charge, a refund or dispute for a specific order, safety, harassment, fraud, account access you can't fix, data deletion, a question you can't answer from the information below, or the user asks for a person or is clearly frustrated.`,
    `If the user asks a study question (maths, essays, exam prep), tell them the AI tutor in the app is the place for that and answer briefly only if it is a platform question.`,
    `Never ask for passwords, card numbers, PINs or OTPs.`,
    `Match the user's language and tone. Keep "reply" friendly, plain text, under 150 words, with short numbered steps when helpful. No markdown headings or bold.`,
    `Reply with JSON only: {"reply": string, "handoff": boolean, "subject": short ticket subject, "category": one of ${CATEGORIES.join("|")}, "priority": "normal"|"high"|"urgent", "summary": one or two sentences for the support agent}.`,
    ``,
    PLATFORM_GUIDE.trim(),
    ``,
    `LIVE PRICES AND LIMITS:`,
    ...(input.settings.length ? input.settings : ["(unavailable)"]),
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
    if (openrouter) {
      const model = Deno.env.get("SUPPORT_MODEL") || "mistralai/mistral-small-3.2-24b-instruct";
      const fallback = Deno.env.get("SUPPORT_FALLBACK_MODEL") || "google/gemini-2.5-flash-lite";
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openrouter}`,
          "HTTP-Referer": "https://campusos-app.vercel.app",
          "X-Title": "CampusOS Support",
        },
        body: JSON.stringify({
          model,
          models: [model, fallback],
          temperature: 0.2,
          max_tokens: 800,
          response_format: { type: "json_object" },
          provider: { sort: "price", allow_fallbacks: true, require_parameters: true },
          messages: [
            { role: "system", content: system },
            ...turns.map((t) => ({ role: t.role, content: t.text })),
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text: string | undefined = data?.choices?.[0]?.message?.content;
      if (!text) return null;
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      return { decision: JSON.parse(cleaned) as Decision, model: (data?.model as string) || model };
    }
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

      const [{ data: found }, history, context, settings] = await Promise.all([
        admin.rpc("search_support_articles", { p_query: question, p_audience: kbAudience, p_limit: 6 }),
        recentMessages(admin, conversationId, 24),
        accountContext(admin, userClient, user.id, audience),
        liveSettings(admin),
      ]);
      const articles = (found ?? []) as Article[];

      let decision: Decision;
      let mode: "ai" | "search" = "search";
      const forced = WANTS_HUMAN.test(question) || SENSITIVE.test(question);
      if (forced) {
        decision = { reply: "", handoff: true };
      } else {
        const ai = await askModel({ audience, articles, context, settings, history, userId: user.id, question });
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
