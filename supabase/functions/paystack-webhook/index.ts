// Paystack webhook. Public endpoint (no JWT) that trusts only requests signed with PAYSTACK_SECRET_KEY.
// Point the Paystack dashboard webhook URL at:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return new Response("Not configured", { status: 503 });

  const raw = await req.text();
  const given = req.headers.get("x-paystack-signature") ?? "";
  if (!safeEqual(await sign(secret, raw), given)) return new Response("Bad signature", { status: 401 });

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    if (event.event === "charge.success") {
      const reference = String(event.data?.reference ?? "");
      const paidKobo = Number(event.data?.amount ?? 0);
      const { data: row } = await admin
        .from("payment_ledger")
        .select("id, status, amount, food_order_id, purpose, meta")
        .eq("reference", reference)
        .maybeSingle();
      if (!row) return new Response("Unknown reference", { status: 200 });
      if (row.status === "success" || row.status === "refunded") return new Response("Already handled", { status: 200 });
      if (Math.round(Number(row.amount) * 100) !== paidKobo) {
        await admin.from("payment_ledger").update({ status: "amount_mismatch" }).eq("id", row.id);
        return new Response("Amount mismatch", { status: 200 });
      }
      await admin.from("payment_ledger").update({ status: "success", meta: { ...(row.meta ?? {}), webhook_at: new Date().toISOString() } }).eq("id", row.id);
      if (row.food_order_id) {
        await admin
          .from("food_orders")
          .update({ payment_status: "paid", paid_at: new Date().toISOString() })
          .eq("id", row.food_order_id)
          .neq("payment_status", "paid");
      } else if (row.purpose === "boost" && row.meta?.boost_id) {
        await admin.rpc("activate_boost", { p_boost: row.meta.boost_id, p_reference: reference });
      }
    } else if (event.event === "charge.failed") {
      const reference = String(event.data?.reference ?? "");
      await admin.from("payment_ledger").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    } else if (event.event === "refund.processed") {
      const reference = String(event.data?.transaction_reference ?? "");
      const { data: row } = await admin.from("payment_ledger").select("id, food_order_id").eq("reference", reference).maybeSingle();
      if (row?.food_order_id) {
        await admin.from("payment_ledger").update({ status: "refunded" }).eq("id", row.id);
        await admin.from("food_orders").update({ payment_status: "refunded" }).eq("id", row.food_order_id);
        await admin.from("refunds").update({ status: "processed" }).eq("order_id", row.food_order_id).in("status", ["approved"]);
      }
    }
  } catch (e) {
    console.error("webhook failed", e);
    return new Response("Error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
