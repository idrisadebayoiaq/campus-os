/** Firebase Cloud Messaging helpers for CampusOS edge functions. */

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("firebase_service_account");
  if (!raw) {
    throw new Error("Missing firebase_service_account secret");
  }
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Invalid firebase_service_account JSON");
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function b64url(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
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
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const jwt = `${header}.${claim}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth token failed: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

export type FcmPayload = {
  token: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
  channelId?: string;
  priority?: "high" | "normal";
};

export async function sendFcm(
  sa: ServiceAccount,
  accessToken: string,
  payload: FcmPayload,
): Promise<{ ok: boolean; error?: string }> {
  const message: Record<string, unknown> = {
    token: payload.token,
    data: payload.data || {},
    android: {
      priority: payload.priority === "normal" ? "NORMAL" : "HIGH",
      ttl: "60s",
      notification: payload.title
        ? {
            title: payload.title,
            body: payload.body || "",
            channel_id: payload.channelId || "campusos_calls",
            sound: "default",
          }
        : undefined,
    },
  };

  if (payload.title) {
    message.notification = {
      title: payload.title,
      body: payload.body || "",
    };
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: JSON.stringify(json) };
  }
  return { ok: true };
}

export async function sendFcmToTokens(
  tokens: string[],
  opts: {
    title?: string;
    body?: string;
    data?: Record<string, string>;
    channelId?: string;
  },
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!tokens.length) return { sent: 0, failed: 0, errors: [] };
  const sa = loadServiceAccount();
  const accessToken = await getAccessToken(sa);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const token of tokens) {
    const r = await sendFcm(sa, accessToken, {
      token,
      title: opts.title,
      body: opts.body,
      data: opts.data,
      channelId: opts.channelId,
      priority: "high",
    });
    if (r.ok) sent++;
    else {
      failed++;
      if (r.error) errors.push(r.error);
    }
  }
  return { sent, failed, errors };
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
