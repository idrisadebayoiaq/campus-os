// Automatic daily payout for food kitchens. Called every morning by pg_cron.
// Each kitchen's available balance (completed orders, minus the platform percentage) is sent to its bank.
// Auth: header x-sweep-token must match internal_secrets.sweep_token (no JWT).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
const kobo = (n: number) => Math.round(n * 100);

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

  const out = { due: 0, started: 0, skipped: 0, failed: 0 };

  // Do not start transfers the Paystack balance cannot cover (that would only send "failed" alerts).
  let available = Number.POSITIVE_INFINITY;
  try {
    const balances = (await paystack("/balance")) as { currency: string; balance: number }[];
    const ngn = balances.find((b) => b.currency === "NGN");
    if (ngn) available = ngn.balance / 100;
  } catch (e) {
    console.error("payout-auto balance", e instanceof Error ? e.message : e);
  }

  const { data: due } = await admin.rpc("auto_payout_due");
  for (const d of (due ?? []) as { business_id: string; balance: number }[]) {
    out.due++;
    const amount = Number(d.balance);
    if (amount > available) {
      out.skipped++;
      continue;
    }
    const { data: began, error: beginErr } = await admin.rpc("payout_begin_auto", { p_business: d.business_id });
    if (beginErr || !began) {
      out.skipped++;
      continue;
    }
    const payout = began as { id: string; reference: string; amount: number };
    try {
      const { data: pm } = await admin
        .from("business_payment_methods")
        .select("id, account_name, account_number, bank_code, paystack_recipient_code")
        .eq("business_id", d.business_id)
        .eq("provider", "paystack")
        .maybeSingle();
      if (!pm) throw new Error("Add your bank account first.");
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
        await admin.from("business_payment_methods").update({ paystack_recipient_code: recipient }).eq("id", pm.id);
      }
      const transfer = await paystack("/transfer", "POST", {
        source: "balance",
        amount: kobo(Number(payout.amount)),
        recipient,
        reference: payout.reference,
        reason: "CampusOS daily payout",
      });
      if (transfer.status === "otp") {
        throw new Error("Transfers need OTP turned off in Paystack settings");
      }
      const state = transfer.status === "success" ? "paid" : "processing";
      await admin.rpc("payout_finish", { p_reference: payout.reference, p_status: state, p_code: transfer.transfer_code });
      available -= Number(payout.amount);
      out.started++;
    } catch (e) {
      // The transfer never started: put the money back on the kitchen's balance.
      await admin.rpc("payout_finish", {
        p_reference: payout.reference,
        p_status: "failed",
        p_reason: e instanceof Error ? e.message : "Transfer failed",
      });
      console.error("payout-auto failed", payout.reference, e instanceof Error ? e.message : e);
      out.failed++;
    }
  }

  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
