// CampusOS payments (Paystack). Signed-in users call this with an `action`.
//
// Secrets (Supabase › Edge Functions › Secrets):
//   PAYSTACK_SECRET_KEY      – required (sk_live_... or sk_test_...)
//   PLATFORM_FEE_PERCENT     – optional, share of food orders kept by CampusOS (default 0)
//
// Actions: status, banks, verify-bank, init-order, init-boost, verify, refund

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

class Fail extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
const FEE_PERCENT = Math.min(Math.max(Number(Deno.env.get("PLATFORM_FEE_PERCENT") ?? "0") || 0, 0), 30);

async function paystack(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  if (!SECRET) throw new Fail("Online payments are not set up yet.", 503);
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status === false) throw new Fail(data?.message || `Paystack error ${res.status}`, 400);
  return data.data;
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
  if (!user) return json({ error: "Sign in first." }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const action = String(body.action ?? "");
  const admin = createClient(url, service, { auth: { persistSession: false } });

  try {
    if (action === "status") return json({ configured: Boolean(SECRET) });

    if (action === "banks") {
      const banks = await paystack("/bank?country=nigeria&perPage=200&use_cursor=false");
      return json({
        banks: (banks as { name: string; code: string; active: boolean }[])
          .filter((b) => b.active)
          .map((b) => ({ name: b.name, code: b.code }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    if (action === "verify-bank") {
      const businessId = String(body.business_id ?? "");
      const bankCode = String(body.bank_code ?? "");
      const account = String(body.account_number ?? "").replace(/\D/g, "");
      if (account.length !== 10) throw new Fail("Account numbers have 10 digits.");
      const { data: biz } = await admin
        .from("business_profiles")
        .select("id, display_name, owner_user_id")
        .eq("id", businessId)
        .maybeSingle();
      if (!biz || biz.owner_user_id !== user.id) throw new Fail("Only the owner can change payout details.", 403);

      const resolved = await paystack(`/bank/resolve?account_number=${account}&bank_code=${encodeURIComponent(bankCode)}`);
      const banks = await paystack("/bank?country=nigeria&perPage=200&use_cursor=false");
      const bankName = (banks as { name: string; code: string }[]).find((b) => b.code === bankCode)?.name ?? null;

      const { data: existing } = await admin
        .from("business_payment_methods")
        .select("id, paystack_subaccount_code")
        .eq("business_id", businessId)
        .eq("provider", "paystack")
        .maybeSingle();

      let sub = existing?.paystack_subaccount_code as string | null | undefined;
      const payload = {
        business_name: biz.display_name,
        settlement_bank: bankCode,
        account_number: account,
        percentage_charge: FEE_PERCENT,
      };
      if (sub) {
        await paystack(`/subaccount/${sub}`, "POST", { ...payload }).catch(async () => {
          const created = await paystack("/subaccount", "POST", payload);
          sub = created.subaccount_code;
        });
      } else {
        const created = await paystack("/subaccount", "POST", payload);
        sub = created.subaccount_code;
      }

      const row = {
        business_id: businessId,
        provider: "paystack",
        account_name: resolved.account_name,
        bank_name: bankName,
        account_number: account,
        bank_code: bankCode,
        paystack_subaccount_code: sub,
        is_verified: true,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) await admin.from("business_payment_methods").update(row).eq("id", existing.id);
      else await admin.from("business_payment_methods").insert(row);
      return json({ ok: true, account_name: resolved.account_name, bank_name: bankName });
    }

    if (action === "init-order") {
      const orderId = String(body.order_id ?? "");
      const callback = typeof body.callback_url === "string" ? body.callback_url : undefined;
      const { data: order } = await admin
        .from("food_orders")
        .select("id, student_id, business_id, total, payment_method, payment_status, status")
        .eq("id", orderId)
        .maybeSingle();
      if (!order || order.student_id !== user.id) throw new Fail("Order not found.", 404);
      if (order.payment_method !== "card") throw new Fail("This order is pay-on-collection.");
      if (order.payment_status === "paid") throw new Fail("This order is already paid.");
      if (["declined", "cancelled", "expired"].includes(order.status)) throw new Fail("This order is closed.");

      const { data: pm } = await admin
        .from("business_payment_methods")
        .select("paystack_subaccount_code, is_verified")
        .eq("business_id", order.business_id)
        .eq("provider", "paystack")
        .maybeSingle();
      if (!pm?.paystack_subaccount_code || !pm.is_verified) throw new Fail("This kitchen cannot take card payments yet.");

      const reference = `ord_${order.id.replaceAll("-", "").slice(0, 16)}_${Date.now().toString(36)}`;
      const amount = Math.round(Number(order.total) * 100);
      const init = await paystack("/transaction/initialize", "POST", {
        email: user.email,
        amount,
        reference,
        subaccount: pm.paystack_subaccount_code,
        callback_url: callback,
        metadata: { purpose: "food_order", order_id: order.id, business_id: order.business_id, user_id: user.id },
      });
      await admin.from("payment_ledger").insert({
        business_id: order.business_id,
        user_id: user.id,
        provider: "paystack",
        reference,
        amount: Number(order.total),
        currency: "NGN",
        status: "pending",
        food_order_id: order.id,
        purpose: "food_order",
        platform_fee: Math.round(Number(order.total) * FEE_PERCENT) / 100,
        meta: {},
      });
      await admin.from("food_orders").update({ payment_status: "pending" }).eq("id", order.id);
      return json({ authorization_url: init.authorization_url, reference });
    }

    if (action === "init-boost") {
      const boostId = String(body.boost_id ?? "");
      const callback = typeof body.callback_url === "string" ? body.callback_url : undefined;
      const { data: boost } = await admin
        .from("listing_boosts")
        .select("id, business_id, amount, status")
        .eq("id", boostId)
        .maybeSingle();
      if (!boost || boost.status !== "pending") throw new Fail("Boost not found.", 404);
      const { data: allowed } = await userClient.rpc("can_manage_business", { p_business: boost.business_id });
      if (!allowed) throw new Fail("Not allowed.", 403);
      if (Number(boost.amount) <= 0) {
        await admin.rpc("activate_boost", { p_boost: boost.id, p_reference: "free" });
        return json({ activated: true });
      }
      const reference = `bst_${boost.id.replaceAll("-", "").slice(0, 16)}_${Date.now().toString(36)}`;
      const init = await paystack("/transaction/initialize", "POST", {
        email: user.email,
        amount: Math.round(Number(boost.amount) * 100),
        reference,
        callback_url: callback,
        metadata: { purpose: "boost", boost_id: boost.id, business_id: boost.business_id, user_id: user.id },
      });
      await admin.from("payment_ledger").insert({
        business_id: boost.business_id,
        user_id: user.id,
        provider: "paystack",
        reference,
        amount: Number(boost.amount),
        currency: "NGN",
        status: "pending",
        purpose: "boost",
        meta: { boost_id: boost.id },
      });
      await admin.from("listing_boosts").update({ payment_reference: reference }).eq("id", boost.id);
      return json({ authorization_url: init.authorization_url, reference });
    }

    if (action === "verify") {
      let reference = String(body.reference ?? "");
      const orderId = String(body.order_id ?? "");
      let query = admin
        .from("payment_ledger")
        .select("id, reference, status, user_id, amount, food_order_id, purpose, meta")
        .eq("user_id", user.id);
      query = orderId
        ? query.eq("food_order_id", orderId).order("created_at", { ascending: false }).limit(1)
        : query.eq("reference", reference);
      const { data: found } = await query;
      const row = found?.[0];
      if (!row) throw new Fail("Payment not found.", 404);
      reference = row.reference;
      if (row.status === "success") return json({ status: "success" });
      const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (tx.status !== "success") return json({ status: tx.status });
      if (Math.round(Number(row.amount) * 100) !== Number(tx.amount)) throw new Fail("Amount mismatch.");
      await admin.from("payment_ledger").update({ status: "success", meta: { ...(row.meta ?? {}), verified_at: new Date().toISOString() } }).eq("id", row.id);
      if (row.food_order_id) {
        await admin
          .from("food_orders")
          .update({ payment_status: "paid", paid_at: new Date().toISOString() })
          .eq("id", row.food_order_id)
          .neq("payment_status", "paid");
      } else if (row.purpose === "boost" && row.meta?.boost_id) {
        await admin.rpc("activate_boost", { p_boost: row.meta.boost_id, p_reference: reference });
      }
      return json({ status: "success" });
    }

    if (action === "refund") {
      const refundId = String(body.refund_id ?? "");
      const { data: refund } = await admin
        .from("refunds")
        .select("id, order_id, business_id, student_id, amount, status")
        .eq("id", refundId)
        .maybeSingle();
      if (!refund || refund.status !== "approved") throw new Fail("Approve the refund first.");
      const { data: biz } = await admin.from("business_profiles").select("owner_user_id").eq("id", refund.business_id).maybeSingle();
      const { data: isStaff } = await userClient.rpc("is_staff");
      if (biz?.owner_user_id !== user.id && !isStaff) throw new Fail("Only the owner can issue refunds.", 403);
      const { data: pay } = await admin
        .from("payment_ledger")
        .select("id, reference")
        .eq("food_order_id", refund.order_id)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pay) throw new Fail("No successful card payment found for this order.");
      await paystack("/refund", "POST", {
        transaction: pay.reference,
        amount: Math.round(Number(refund.amount) * 100),
      });
      await admin.from("refunds").update({ status: "processed" }).eq("id", refund.id);
      await admin.from("food_orders").update({ payment_status: "refunded" }).eq("id", refund.order_id);
      await admin.from("payment_ledger").update({ status: "refunded" }).eq("id", pay.id);
      await admin.from("notifications").insert({
        user_id: refund.student_id,
        title: "Refund sent",
        body: `₦${Number(refund.amount).toLocaleString()} is on its way back to your card.`,
        link: "/orders",
      });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message, code: e.status === 503 ? "not_configured" : undefined }, e.status);
    console.error("paystack function failed", e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
