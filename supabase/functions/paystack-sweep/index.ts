// Paystack sweeper. Called every 2 minutes by pg_cron (see migration wallet_payments_core).
// It asks Paystack about anything unfinished, so CampusOS never depends on a webhook:
//   - card payments still pending (top-ups, orders, boosts)
//   - withdrawals that are still processing
//   - approved card refunds that have not been sent yet
// Auth: header x-sweep-token must match internal_secrets.sweep_token (no JWT).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");

async function paystack(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status === false) throw new Error(data?.message || `Paystack error ${res.status}`);
  return data.data;
}

Deno.serve(async (req) => {
  if (!SECRET) return new Response("Not configured", { status: 503 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: tokenRow } = await admin.from("internal_secrets").select("value").eq("key", "sweep_token").maybeSingle();
  const given = req.headers.get("x-sweep-token") ?? "";
  if (!tokenRow?.value || given !== tokenRow.value) return new Response("Forbidden", { status: 403 });

  const out = { payments: 0, settled: 0, payouts: 0, refunds: 0, renewals: 0, renewed: 0 };

  // 1. Pending card payments from the last 3 days that are at least a minute old.
  const { data: pending } = await admin
    .from("payment_ledger")
    .select("reference")
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 3 * 86400_000).toISOString())
    .lte("created_at", new Date(Date.now() - 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(30);
  for (const p of pending ?? []) {
    out.payments++;
    try {
      const tx = await paystack(`/transaction/verify/${encodeURIComponent(p.reference)}`);
      if (tx.status === "success") {
        const { data } = await admin.rpc("settle_payment", {
          p_reference: p.reference,
          p_paid_kobo: Number(tx.amount),
          p_auth: tx.authorization ? { ...tx.authorization, email: tx.customer?.email } : null,
        });
        if (data === "success") out.settled++;
      } else if (tx.status === "failed") {
        await admin.rpc("fail_payment", { p_reference: p.reference, p_reason: String(tx.gateway_response ?? "") });
      }
    } catch (e) {
      console.error("sweep payment", p.reference, e instanceof Error ? e.message : e);
    }
  }

  // 2. Withdrawals that have not finished.
  const { data: payouts } = await admin
    .from("payouts")
    .select("reference, status, created_at")
    .in("status", ["requested", "processing"])
    .lte("created_at", new Date(Date.now() - 90_000).toISOString())
    .limit(20);
  for (const p of payouts ?? []) {
    out.payouts++;
    try {
      const t = await paystack(`/transfer/verify/${encodeURIComponent(p.reference)}`);
      if (t.status === "success") {
        await admin.rpc("payout_finish", { p_reference: p.reference, p_status: "paid", p_code: t.transfer_code });
      } else if (t.status === "failed" || t.status === "reversed") {
        await admin.rpc("payout_finish", { p_reference: p.reference, p_status: "failed", p_reason: t.reason ?? "The transfer did not go through" });
      }
    } catch (e) {
      // Paystack has never seen this transfer: the request died before it started, so return the money.
      const old = Date.now() - new Date(p.created_at).getTime() > 10 * 60_000;
      if (old && p.status === "requested") {
        await admin.rpc("payout_finish", { p_reference: p.reference, p_status: "failed", p_reason: "The transfer never started" });
      }
      console.error("sweep payout", p.reference, e instanceof Error ? e.message : e);
    }
  }

  // 3. Approved refunds on card orders (for example when a kitchen declined a paid order).
  const { data: refunds } = await admin
    .from("refunds")
    .select("id, order_id, student_id, amount, food_orders!inner(payment_method)")
    .eq("status", "approved")
    .eq("food_orders.payment_method", "card")
    .limit(10);
  for (const r of refunds ?? []) {
    out.refunds++;
    try {
      const { data: pay } = await admin
        .from("payment_ledger")
        .select("id, reference")
        .eq("food_order_id", r.order_id)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pay) continue;
      await paystack("/refund", "POST", { transaction: pay.reference, amount: Math.round(Number(r.amount) * 100) });
      await admin.rpc("record_card_refund", { p_refund: r.id });
      await admin.from("refunds").update({ status: "processed" }).eq("id", r.id);
      await admin.from("food_orders").update({ payment_status: "refunded" }).eq("id", r.order_id);
      await admin.from("payment_ledger").update({ status: "refunded" }).eq("id", pay.id);
      await admin.from("notifications").insert({
        user_id: r.student_id,
        title: "Refund sent",
        body: `₦${Number(r.amount).toLocaleString()} is on its way back to your card.`,
        link: "/orders",
      });
    } catch (e) {
      console.error("sweep refund", r.id, e instanceof Error ? e.message : e);
    }
  }

  // 4. Plans and Premium that renew by card. Charges the saved card shortly before the plan ends.
  const { data: due } = await admin.rpc("plans_due_for_renewal");
  for (const d of (due ?? []) as {
    kind: string;
    user_id: string;
    business_id: string | null;
    amount: number;
    authorization_code: string;
    email: string;
  }[]) {
    out.renewals++;
    const reference = `ren_${(d.business_id ?? d.user_id).replaceAll("-", "").slice(0, 16)}_${Date.now().toString(36)}`;
    try {
      await admin.from("payment_ledger").insert({
        business_id: d.business_id,
        user_id: d.user_id,
        provider: "paystack",
        reference,
        amount: d.amount,
        currency: "NGN",
        status: "pending",
        purpose: "subscription",
        meta: d.business_id ? { business_id: d.business_id, renewal: "true" } : { student: "true", renewal: "true" },
      });
      const tx = await paystack("/transaction/charge_authorization", "POST", {
        authorization_code: d.authorization_code,
        email: d.email,
        amount: Math.round(Number(d.amount) * 100),
        reference,
      });
      if (tx.status === "success") {
        await admin.rpc("settle_payment", { p_reference: reference, p_paid_kobo: Number(tx.amount) });
        out.renewed++;
      } else if (tx.status === "failed") {
        await admin.rpc("fail_payment", { p_reference: reference });
        await admin.rpc("plan_renewal_failed", { p_user: d.user_id, p_business: d.business_id });
      }
    } catch (e) {
      await admin.rpc("fail_payment", { p_reference: reference });
      await admin.rpc("plan_renewal_failed", { p_user: d.user_id, p_business: d.business_id });
      console.error("sweep renewal", reference, e instanceof Error ? e.message : e);
    }
  }

  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
