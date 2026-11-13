import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * CampusOS Paystack webhook stub.
 * Verifies event idempotency into payment_ledger once PAYSTACK_SECRET_KEY is set.
 * Student search stays free; this path is for business subscriptions/fees only.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const body = await request.text();

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        message: "CampusOS Paystack webhook stub — set PAYSTACK_SECRET_KEY to go live.",
      },
      { status: 501 },
    );
  }

  // Signature verification + event handling land here before production.
  const payload = JSON.parse(body || "{}") as {
    event?: string;
    data?: { reference?: string; amount?: number; metadata?: { business_id?: string; user_id?: string } };
  };

  const reference = payload.data?.reference;
  if (!reference) {
    return NextResponse.json({ ok: false, error: "Missing reference" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing } = await supabase
    .from("payment_ledger")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await supabase.from("payment_ledger").insert({
    business_id: payload.data?.metadata?.business_id ?? null,
    user_id: payload.data?.metadata?.user_id ?? null,
    provider: "paystack",
    reference,
    amount: (payload.data?.amount || 0) / 100,
    currency: "NGN",
    status: payload.event === "charge.success" ? "success" : "received",
    meta: payload,
  });

  return NextResponse.json({ ok: true });
}
