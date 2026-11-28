// Sends phone push (FCM v1) for a new notification row or chat message.
// Called by the notifications_push / messages_push triggers through pg_net.
// Auth: header x-push-token must match internal_secrets.push_token (no JWT).
// Secret: firebase_service_account (service account JSON for the Firebase project).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type Push = { title: string; body: string; data: Record<string, string>; tag?: string; image?: string; channel?: string };

// Flip to true once phones run the app version that creates the new channels (1.2.0+).
// Before that, a channel the phone does not know falls back to a quiet default.
const USE_NEW_CHANNELS = false;
const CHANNELS: Record<string, string> = {
  chat: "campusos_chat",
  rooms: "campusos_rooms",
  mentions: "campusos_chat",
  money: "campusos_money",
  school: "campusos_school",
};
const channelFor = (category?: string | null) =>
  USE_NEW_CHANNELS && category && CHANNELS[category] ? CHANNELS[category] : "campusos_default";

let cachedToken: { value: string; expires: number } | null = null;

function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get("firebase_service_account") || Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("Missing firebase_service_account secret");
  const sa = JSON.parse(raw) as ServiceAccount;
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

function b64url(data: ArrayBuffer | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(sa: ServiceAccount) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${b64url(sig)}`,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`oauth_failed ${JSON.stringify(json).slice(0, 200)}`);
  cachedToken = { value: json.access_token, expires: Date.now() + 3500_000 };
  return cachedToken.value;
}

async function sendAll(tokens: string[], push: Push) {
  const sa = serviceAccount();
  const auth = await accessToken(sa);
  const dead: string[] = [];
  let sent = 0;
  const errors: string[] = [];
  for (const token of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: push.title, body: push.body, ...(push.image ? { image: push.image } : {}) },
          data: push.data,
          android: {
            priority: "HIGH",
            ttl: "86400s",
            notification: {
              channel_id: push.channel || "campusos_default",
              sound: "default",
              ...(push.tag ? { tag: push.tag } : {}),
            },
          },
        },
      }),
    });
    if (res.ok) {
      sent++;
      continue;
    }
    const text = await res.text().catch(() => "");
    errors.push(`${res.status} ${text.slice(0, 200)}`);
    if (res.status === 404 || text.includes("UNREGISTERED") || text.includes("registration token is not a valid")) {
      dead.push(token);
    }
  }
  return { sent, failed: tokens.length - sent, dead, errors };
}

const preview = (type: string, body: string | null) => {
  const caption = (body ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (type === "image") return caption ? `Photo: ${caption}` : "Photo";
  if (type === "video") return caption ? `Video: ${caption}` : "Video";
  if (type === "audio") return "Voice message";
  if (type === "file") return caption ? `File: ${caption}` : "File";
  if (type === "location") return "Location";
  if (type === "contact") return "Contact";
  return caption || "New message";
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: secretRow } = await admin.from("internal_secrets").select("value").eq("key", "push_token").maybeSingle();
  if (!secretRow?.value || req.headers.get("x-push-token") !== secretRow.value) {
    return new Response("Forbidden", { status: 403 });
  }

  const { kind, id, test_token } = (await req.json().catch(() => ({}))) as {
    kind?: string;
    id?: string;
    test_token?: string;
  };

  let users: string[] = [];
  let push: Push | null = null;

  if (kind === "test" && test_token) {
    const result = await sendAll([test_token], { title: "CampusOS", body: "Push test", data: {} }).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }));
    return Response.json(result);
  }

  if (kind === "notification" && id) {
    const { data: n } = await admin
      .from("notifications")
      .select("user_id, title, body, link, category, image_url, group_key")
      .eq("id", id)
      .maybeSingle();
    if (!n) return Response.json({ skipped: "not_found" });
    users = [n.user_id];
    push = {
      title: n.title || "CampusOS",
      body: n.body || "",
      data: { link: n.link || "/notifications", notification_id: id, category: n.category || "general" },
      tag: n.group_key || undefined,
      image: n.image_url || undefined,
      channel: channelFor(n.category),
    };
  } else if (kind === "message" && id) {
    const { data: m } = await admin
      .from("messages")
      .select("conversation_id, sender_id, body, message_type")
      .eq("id", id)
      .maybeSingle();
    if (!m?.sender_id) return Response.json({ skipped: "not_found" });
    const [{ data: conv }, { data: parts }, { data: sender }] = await Promise.all([
      admin.from("conversations").select("kind, subject, business_id").eq("id", m.conversation_id).maybeSingle(),
      admin.from("conversation_participants").select("user_id, muted").eq("conversation_id", m.conversation_id),
      admin.from("profiles").select("preferred_name, first_name, full_name").eq("id", m.sender_id).maybeSingle(),
    ]);
    if (!conv) return Response.json({ skipped: "no_conversation" });
    users = (parts ?? []).filter((p) => p.user_id !== m.sender_id && !p.muted).map((p) => p.user_id);

    let name =
      sender?.preferred_name?.trim() || sender?.first_name?.trim() || sender?.full_name?.trim()?.split(" ")[0] || "New message";
    if (conv.business_id) {
      const { data: biz } = await admin
        .from("business_profiles")
        .select("display_name, owner_user_id")
        .eq("id", conv.business_id)
        .maybeSingle();
      if (biz && biz.owner_user_id === m.sender_id) name = biz.display_name || name;
    }
    const text = preview(m.message_type, m.body);
    const group = ["group", "class", "room"].includes(conv.kind) && conv.subject;
    push = {
      title: group ? String(conv.subject) : name,
      body: group ? `${name}: ${text}` : text,
      data: { link: `/inbox/${m.conversation_id}`, conversation_id: m.conversation_id, category: "chat" },
      tag: m.conversation_id,
      channel: channelFor("chat"),
    };
  }

  if (!push || !users.length) return Response.json({ skipped: "nothing_to_send" });

  const { data: tokens } = await admin.rpc("push_tokens_for", { p_users: users });
  const list = (tokens as string[] | null) ?? [];
  if (!list.length) return Response.json({ skipped: "no_tokens" });

  try {
    const result = await sendAll(list, push);
    if (result.dead.length) await admin.from("device_push_tokens").delete().in("token", result.dead);
    if (result.errors.length) console.error("push_errors", result.errors.slice(0, 3).join(" | "));
    return Response.json({ sent: result.sent, failed: result.failed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("push_failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
});
