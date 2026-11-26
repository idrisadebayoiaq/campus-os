// CampusOS payments (Paystack). Signed-in users call this with an `action`.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   PAYSTACK_SECRET_KEY  - required (sk_live_... or sk_test_...). Everything else is set up through the API.
//
// Actions: status, banks, resolve-bank, verify-bank, init-topup, init-order, init-boost, init-plan,
//          init-premium, verify, verify-mine, payout, refund, platform-balance
// resolve-bank, verify-bank and payout work for a business (business_id) or, without it, for the signed-in student.

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

async function paystack(path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown) {
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

const kobo = (naira: number) => Math.round(naira * 100);

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
  const email = user.email || `${user.id}@users.campusos.app`;

  async function num(key: string, fallback: number): Promise<number> {
    const { data } = await admin.rpc("setting_num", { p_key: key, p_default: fallback });
    return Number(data ?? fallback);
  }

  // Checks one payment with Paystack and settles it in the database.
  async function checkPayment(reference: string): Promise<string> {
    const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (tx.status === "success") {
      const { data } = await admin.rpc("settle_payment", {
        p_reference: reference,
        p_paid_kobo: Number(tx.amount),
        p_auth: tx.authorization ? { ...tx.authorization, email: tx.customer?.email } : null,
      });
      return String(data ?? "success");
    }
    if (tx.status === "failed") await admin.rpc("fail_payment", { p_reference: reference });
    return String(tx.status);
  }

  async function requireOwner(businessId: string) {
    const { data: biz } = await admin
      .from("business_profiles")
      .select("id, display_name, owner_user_id")
      .eq("id", businessId)
      .maybeSingle();
    if (!biz || biz.owner_user_id !== user!.id) throw new Fail("Only the owner can do this.", 403);
    return biz as { id: string; display_name: string; owner_user_id: string };
  }

  try {
    if (action === "status") {
      const walletEnabled = await admin.rpc("setting_bool", { p_key: "wallet_enabled", p_default: true });
      return json({
        configured: Boolean(SECRET),
        mode: SECRET?.startsWith("sk_live_") ? "live" : SECRET ? "test" : null,
        wallet_enabled: Boolean(walletEnabled.data),
        topup_min: await num("topup_min", 500),
        topup_max: await num("topup_max", 100000),
        wallet_cap: await num("wallet_cap", 200000),
      });
    }

    if (action === "platform-balance") {
      const { data: isStaff } = await userClient.rpc("is_staff");
      if (!isStaff) throw new Fail("Not allowed.", 403);
      const balances = await paystack("/balance");
      return json({ balances });
    }

    if (action === "banks") {
      const banks = await paystack("/bank?country=nigeria&perPage=200&use_cursor=false");
      return json({
        banks: (banks as { name: string; code: string; active: boolean }[])
          .filter((b) => b.active)
          .map((b) => ({ name: b.name, code: b.code }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    // Step 1 of adding a bank: look up the account name so the owner can confirm it. Nothing is saved.
    if (action === "resolve-bank") {
      const businessId = String(body.business_id ?? "");
      const bankCode = String(body.bank_code ?? "");
      const account = String(body.account_number ?? "").replace(/\D/g, "");
      if (account.length !== 10) throw new Fail("Account numbers have 10 digits.");
      if (businessId) await requireOwner(businessId);
      const resolved = await paystack(`/bank/resolve?account_number=${account}&bank_code=${encodeURIComponent(bankCode)}`);
      const banks = await paystack("/bank?country=nigeria&perPage=200&use_cursor=false");
      const bankName = (banks as { name: string; code: string }[]).find((b) => b.code === bankCode)?.name ?? null;
      return json({ account_name: resolved.account_name, bank_name: bankName });
    }

    // Step 2: the owner confirmed the name, so save it and set up the payout accounts on Paystack.
    if (action === "verify-bank") {
      const businessId = String(body.business_id ?? "");
      const bankCode = String(body.bank_code ?? "");
      const account = String(body.account_number ?? "").replace(/\D/g, "");
      if (account.length !== 10) throw new Fail("Account numbers have 10 digits.");
      if (!businessId) {
        // A student saving the bank account their earnings are paid to.
        const { data: openMine } = await admin.from("payouts").select("id").eq("user_id", user.id).in("status", ["requested", "processing"]).limit(1);
        if (openMine?.length) throw new Fail("Wait for your current withdrawal to finish before changing your bank.");
        const resolvedMe = await paystack(`/bank/resolve?account_number=${account}&bank_code=${encodeURIComponent(bankCode)}`);
        const banksMe = await paystack("/bank?country=nigeria&perPage=200&use_cursor=false");
        const bankNameMe = (banksMe as { name: string; code: string }[]).find((b) => b.code === bankCode)?.name ?? null;
        const recipientMe = await paystack("/transferrecipient", "POST", {
          type: "nuban",
          name: resolvedMe.account_name,
          account_number: account,
          bank_code: bankCode,
          currency: "NGN",
        });
        await admin.from("user_payout_accounts").upsert({
          user_id: user.id,
          account_name: resolvedMe.account_name,
          bank_name: bankNameMe,
          account_number: account,
          bank_code: bankCode,
          paystack_recipient_code: recipientMe.recipient_code,
          is_verified: true,
          updated_at: new Date().toISOString(),
        });
        return json({ ok: true, account_name: resolvedMe.account_name, bank_name: bankNameMe });
      }
      const biz = await requireOwner(businessId);

      const { data: open } = await admin
        .from("payouts")
        .select("id")
        .eq("business_id", businessId)
        .in("status", ["requested", "processing"])
        .limit(1);
      if (open?.length) throw new Fail("Wait for your current withdrawal to finish before changing your bank.");

      const resolved = await paystack(`/bank/resolve?account_number=${account}&bank_code=${encodeURIComponent(bankCode)}`);
      const banks = await paystack("/bank?country=nigeria&perPage=200&use_cursor=false");
      const bankName = (banks as { name: string; code: string }[]).find((b) => b.code === bankCode)?.name ?? null;

      const { data: existing } = await admin
        .from("business_payment_methods")
        .select("id, paystack_subaccount_code")
        .eq("business_id", businessId)
        .eq("provider", "paystack")
        .maybeSingle();

      // percentage_charge is 0: CampusOS commission is sent per payment as a flat amount.
      const payload = {
        business_name: biz.display_name,
        settlement_bank: bankCode,
        account_number: account,
        percentage_charge: 0,
      };
      let sub = existing?.paystack_subaccount_code as string | null | undefined;
      if (sub) {
        try {
          await paystack(`/subaccount/${sub}`, "PUT", payload);
        } catch {
          const created = await paystack("/subaccount", "POST", payload);
          sub = created.subaccount_code;
        }
      } else {
        const created = await paystack("/subaccount", "POST", payload);
        sub = created.subaccount_code;
      }

      const recipient = await paystack("/transferrecipient", "POST", {
        type: "nuban",
        name: resolved.account_name,
        account_number: account,
        bank_code: bankCode,
        currency: "NGN",
      });

      const row = {
        business_id: businessId,
        provider: "paystack",
        account_name: resolved.account_name,
        bank_name: bankName,
        account_number: account,
        bank_code: bankCode,
        paystack_subaccount_code: sub,
        paystack_recipient_code: recipient.recipient_code,
        is_verified: true,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) await admin.from("business_payment_methods").update(row).eq("id", existing.id);
      else await admin.from("business_payment_methods").insert(row);
      return json({ ok: true, account_name: resolved.account_name, bank_name: bankName });
    }

    if (action === "init-topup") {
      const callback = typeof body.callback_url === "string" ? body.callback_url : undefined;
      const credit = Math.round(Number(body.amount ?? 0));
      const { data: enabled } = await admin.rpc("setting_bool", { p_key: "wallet_enabled", p_default: true });
      if (!enabled) throw new Fail("The wallet is not available right now.");
      const min = await num("topup_min", 500);
      const max = await num("topup_max", 100000);
      const cap = await num("wallet_cap", 200000);
      if (!Number.isFinite(credit) || credit < min) throw new Fail(`The smallest top-up is ₦${min.toLocaleString()}.`);
      if (credit > max) throw new Fail(`The largest top-up is ₦${max.toLocaleString()}.`);
      const { data: wallet } = await admin.from("wallets").select("balance, status").eq("user_id", user.id).maybeSingle();
      if (wallet?.status === "frozen") throw new Fail("Your wallet is on hold. Contact support.");
      if (Number(wallet?.balance ?? 0) + credit > cap) throw new Fail(`Your wallet can hold up to ₦${cap.toLocaleString()}.`);

      const { data: quote, error: qErr } = await userClient.rpc("topup_quote", { p_amount: credit });
      const q = Array.isArray(quote) ? quote[0] : quote;
      if (qErr || !q) throw new Fail("Could not price this top-up.");

      const reference = `top_${user.id.replaceAll("-", "").slice(0, 12)}_${Date.now().toString(36)}`;
      const init = await paystack("/transaction/initialize", "POST", {
        email,
        amount: kobo(Number(q.total)),
        reference,
        callback_url: callback,
        channels: ["card"],
        metadata: { purpose: "wallet_topup", user_id: user.id, credit },
      });
      await admin.from("payment_ledger").insert({
        user_id: user.id,
        provider: "paystack",
        reference,
        amount: Number(q.total),
        currency: "NGN",
        status: "pending",
        purpose: "wallet_topup",
        meta: { credit, fee: Number(q.fee) },
      });
      return json({ authorization_url: init.authorization_url, reference, credit, fee: Number(q.fee), total: Number(q.total) });
    }

    if (action === "init-order") {
      const orderId = String(body.order_id ?? "");
      const callback = typeof body.callback_url === "string" ? body.callback_url : undefined;
      const { data: order } = await admin
        .from("food_orders")
        .select("id, student_id, business_id, total, commission, payment_method, payment_status, status")
        .eq("id", orderId)
        .maybeSingle();
      if (!order || order.student_id !== user.id) throw new Fail("Order not found.", 404);
      if (order.payment_method !== "card") throw new Fail("This order is not a card order.");
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
      const commission = Number(order.commission ?? 0);
      const init = await paystack("/transaction/initialize", "POST", {
        email,
        amount: kobo(Number(order.total)),
        reference,
        callback_url: callback,
        channels: ["card"],
        subaccount: pm.paystack_subaccount_code,
        transaction_charge: kobo(commission), // CampusOS keeps this flat amount
        bearer: "account", // CampusOS pays the Paystack fee, the kitchen gets total - commission
        metadata: { purpose: "order", order_id: order.id, business_id: order.business_id, user_id: user.id },
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
        purpose: "order",
        platform_fee: commission,
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
        email,
        amount: kobo(Number(boost.amount)),
        reference,
        callback_url: callback,
        channels: ["card"],
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

    if (action === "init-plan") {
      const businessId = String(body.business_id ?? "");
      const callback = typeof body.callback_url === "string" ? body.callback_url : undefined;
      await requireOwner(businessId);
      const price = await num("business_plan_price", 3000);
      const reference = `plan_${businessId.replaceAll("-", "").slice(0, 16)}_${Date.now().toString(36)}`;
      const init = await paystack("/transaction/initialize", "POST", {
        email,
        amount: kobo(price),
        reference,
        callback_url: callback,
        channels: ["card"],
        metadata: { purpose: "subscription", business_id: businessId, user_id: user.id },
      });
      await admin.from("payment_ledger").insert({
        business_id: businessId,
        user_id: user.id,
        provider: "paystack",
        reference,
        amount: price,
        currency: "NGN",
        status: "pending",
        purpose: "subscription",
        meta: { business_id: businessId },
      });
      return json({ authorization_url: init.authorization_url, reference });
    }

    // Student Premium by card. The card is saved (when Paystack allows) so it can renew by itself.
    if (action === "init-premium") {
      const callback = typeof body.callback_url === "string" ? body.callback_url : undefined;
      const price = await num("student_plan_price", 1000);
      const reference = `prem_${user.id.replaceAll("-", "").slice(0, 16)}_${Date.now().toString(36)}`;
      const init = await paystack("/transaction/initialize", "POST", {
        email,
        amount: kobo(price),
        reference,
        callback_url: callback,
        channels: ["card"],
        metadata: { purpose: "subscription", student: true, user_id: user.id },
      });
      await admin.from("payment_ledger").insert({
        user_id: user.id,
        provider: "paystack",
        reference,
        amount: price,
        currency: "NGN",
        status: "pending",
        purpose: "subscription",
        meta: { student: "true" },
      });
      return json({ authorization_url: init.authorization_url, reference });
    }

    if (action === "verify") {
      const orderId = String(body.order_id ?? "");
      let query = admin.from("payment_ledger").select("reference, status").eq("user_id", user.id);
      query = orderId
        ? query.eq("food_order_id", orderId).order("created_at", { ascending: false }).limit(1)
        : query.eq("reference", String(body.reference ?? ""));
      const { data: found } = await query;
      const row = found?.[0];
      if (!row) throw new Fail("Payment not found.", 404);
      if (row.status === "success") return json({ status: "success" });
      return json({ status: await checkPayment(row.reference) });
    }

    // Checks every recent unfinished payment of this user (used when the app comes back from checkout).
    if (action === "verify-mine") {
      const since = new Date(Date.now() - 3 * 86400_000).toISOString();
      const { data: rows } = await admin
        .from("payment_ledger")
        .select("reference")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(8);
      let settled = 0;
      for (const r of rows ?? []) {
        try {
          if ((await checkPayment(r.reference)) === "success") settled++;
        } catch (e) {
          console.error("verify-mine", r.reference, e);
        }
      }
      return json({ checked: rows?.length ?? 0, settled });
    }

    if (action === "payout") {
      const businessId = String(body.business_id ?? "");
      if (businessId) await requireOwner(businessId);
      const { data: began, error: beginErr } = businessId
        ? await admin.rpc("payout_begin", { p_business: businessId, p_user: user.id })
        : await admin.rpc("user_payout_begin", { p_user: user.id });
      if (beginErr) throw new Fail(beginErr.message.replace(/^.*?: /, ""));
      const payout = began as { id: string; reference: string; amount: number };

      try {
        const { data: pm } = businessId
          ? await admin
              .from("business_payment_methods")
              .select("id, account_name, account_number, bank_code, paystack_recipient_code")
              .eq("business_id", businessId)
              .eq("provider", "paystack")
              .maybeSingle()
          : await admin
              .from("user_payout_accounts")
              .select("user_id, account_name, account_number, bank_code, paystack_recipient_code")
              .eq("user_id", user.id)
              .maybeSingle();
        if (!pm) throw new Fail("Add your bank account first.");
        let recipient = pm.paystack_recipient_code as string | null;
        if (!recipient) {
          const created = await paystack("/transferrecipient", "POST", {
            type: "nuban",
            name: pm.account_name,
            account_number: pm.account_number,
            bank_code: pm.bank_code,
            currency: "NGN",
          });
          recipient = created.recipient_code as string;
          if (businessId) await admin.from("business_payment_methods").update({ paystack_recipient_code: recipient }).eq("id", (pm as { id: string }).id);
          else await admin.from("user_payout_accounts").update({ paystack_recipient_code: recipient }).eq("user_id", user.id);
        }
        const transfer = await paystack("/transfer", "POST", {
          source: "balance",
          amount: kobo(Number(payout.amount)),
          recipient,
          reference: payout.reference,
          reason: "CampusOS payout",
        });
        if (transfer.status === "otp") {
          await admin.rpc("payout_finish", { p_reference: payout.reference, p_status: "failed", p_reason: "Transfers need OTP turned off in Paystack settings" });
          throw new Fail("Withdrawals are not ready yet. We have been told and your balance is safe.", 503);
        }
        const state = transfer.status === "success" ? "paid" : "processing";
        await admin.rpc("payout_finish", { p_reference: payout.reference, p_status: state, p_code: transfer.transfer_code });
        return json({ ok: true, status: state, amount: Number(payout.amount) });
      } catch (e) {
        // The transfer never started, so give the money back.
        if (!(e instanceof Fail && e.status === 503 && e.message.startsWith("Withdrawals"))) {
          await admin.rpc("payout_finish", {
            p_reference: payout.reference,
            p_status: "failed",
            p_reason: e instanceof Error ? e.message : "Transfer failed",
          });
        }
        console.error("payout failed", payout.reference, e instanceof Error ? e.message : e);
        if (e instanceof Fail) throw e;
        throw new Fail("The withdrawal did not start. Your balance is safe, try again later.", 500);
      }
    }

    if (action === "refund") {
      const refundId = String(body.refund_id ?? "");
      const { data: refund } = await admin
        .from("refunds")
        .select("id, order_id, business_id, student_id, amount, status")
        .eq("id", refundId)
        .maybeSingle();
      if (!refund) throw new Fail("Refund not found.", 404);
      if (refund.status === "processed") return json({ ok: true });
      if (refund.status !== "approved") throw new Fail("Approve the refund first.");
      const { data: biz } = await admin.from("business_profiles").select("owner_user_id").eq("id", refund.business_id).maybeSingle();
      const { data: isStaff } = await userClient.rpc("is_staff");
      if (biz?.owner_user_id !== user.id && !isStaff) throw new Fail("Only the owner can issue refunds.", 403);
      const { data: order } = await admin.from("food_orders").select("payment_method").eq("id", refund.order_id).maybeSingle();
      if (order?.payment_method === "wallet") return json({ ok: true });
      const { data: pay } = await admin
        .from("payment_ledger")
        .select("id, reference")
        .eq("food_order_id", refund.order_id)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pay) throw new Fail("No successful card payment found for this order.");
      await paystack("/refund", "POST", { transaction: pay.reference, amount: kobo(Number(refund.amount)) });
      await admin.rpc("record_card_refund", { p_refund: refund.id });
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
