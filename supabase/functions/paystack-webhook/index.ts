// Paystack webhook (OPTIONAL accelerator). Everything also works without it: the app verifies on return
// and the paystack-sweep job checks Paystack every couple of minutes.
// Public endpoint (no JWT) that trusts only requests signed with PAYSTACK_SECRET_KEY.
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
    const data = event.data ?? {};
    if (event.event === "charge.success") {
      await admin.rpc("settle_payment", { p_reference: String(data.reference ?? ""), p_paid_kobo: Number(data.amount ?? 0) });
    } else if (event.event === "charge.failed") {
      await admin.rpc("fail_payment", { p_reference: String(data.reference ?? "") });
    } else if (event.event === "transfer.success") {
      await admin.rpc("payout_finish", { p_reference: String(data.reference ?? ""), p_status: "paid", p_code: String(data.transfer_code ?? "") });
    } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
      await admin.rpc("payout_finish", {
        p_reference: String(data.reference ?? ""),
        p_status: "failed",
        p_reason: String(data.reason ?? "The transfer did not go through"),
      });
    } else if (event.event === "refund.processed") {
      const reference = String(data.transaction_reference ?? "");
      const { data: row } = await admin.from("payment_ledger").select("id, food_order_id").eq("reference", reference).maybeSingle();
      if (row?.food_order_id) {
        await admin.from("payment_ledger").update({ status: "refunded" }).eq("id", row.id);
        await admin.from("food_orders").update({ payment_status: "refunded" }).eq("id", row.food_order_id);
        const { data: refunds } = await admin.from("refunds").select("id").eq("order_id", row.food_order_id).eq("status", "approved");
        for (const r of refunds ?? []) {
          await admin.rpc("record_card_refund", { p_refund: r.id });
          await admin.from("refunds").update({ status: "processed" }).eq("id", r.id);
        }
      }
    }
  } catch (e) {
    console.error("webhook failed", e);
    return new Response("Error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
