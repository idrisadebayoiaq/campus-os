import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PayoutForm,
  RefundList,
  VerificationPanel,
  type PayoutAccount,
  type RefundRow,
} from "@/components/billing-panels";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Billing" };
export const instant = false;

function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const owned = (await myBusinesses(supabase, user.id)).filter((b) => b.role === "owner");
  if (!owned.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="Owner only" description="Payouts, refunds and verification are managed by the business owner." />
        </div>
      </Container>
    );
  }
  const ids = owned.map((b) => b.id);
  const kitchens = owned.filter((b) => b.business_type === "food_vendor");
  const since = new Date(Date.now() - 8 * 7 * 86400_000).toISOString();

  const [{ data: payouts }, { data: refunds }, { data: ledger }, { data: orders }, { data: boosts }, { data: plans }, { data: verReqs }, { data: levels }] =
    await Promise.all([
      supabase
        .from("business_payment_methods")
        .select("business_id, account_name, bank_name, account_number, is_verified")
        .in("business_id", ids)
        .eq("provider", "paystack"),
      supabase.from("refunds").select("id, business_id, amount, reason, status, created_at, order_id").in("business_id", ids).order("created_at", { ascending: false }).limit(30),
      supabase
        .from("payment_ledger")
        .select("id, reference, amount, status, purpose, created_at, business_id")
        .in("business_id", ids)
        .order("created_at", { ascending: false })
        .limit(25),
      kitchens.length
        ? supabase
            .from("food_orders")
            .select("total, created_at, payment_method, payment_status, status, business_id")
            .in("business_id", kitchens.map((k) => k.id))
            .in("status", ["completed", "collected"])
            .gte("created_at", since)
        : Promise.resolve({ data: [] as { total: number; created_at: string; payment_method: string; payment_status: string; status: string; business_id: string }[] }),
      supabase.from("listing_boosts").select("id, status, amount").in("business_id", ids).eq("status", "pending"),
      supabase.from("subscription_plans").select("*").in("business_id", ids).order("created_at", { ascending: false }),
      supabase.from("verification_requests").select("business_id, status, note, created_at").in("business_id", ids).order("created_at", { ascending: false }),
      supabase.from("business_profiles").select("id, verification_level, verification_label").in("id", ids),
    ]);

  const weeks = new Map<string, { sales: number; card: number; cash: number; count: number }>();
  for (const o of orders ?? []) {
    const key = weekStart(new Date(o.created_at)).toISOString().slice(0, 10);
    const w = weeks.get(key) ?? { sales: 0, card: 0, cash: 0, count: 0 };
    const t = Number(o.total);
    w.sales += t;
    w.count += 1;
    if (o.payment_method === "card" && o.payment_status === "paid") w.card += t;
    else w.cash += t;
    weeks.set(key, w);
  }
  const weekRows = [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const paymentMethod = (id: string) =>
    ((payouts ?? []).find((p) => p.business_id === id) as PayoutAccount | undefined) ?? null;

  return (
    <Container>
      <div className="space-y-10 py-8 sm:py-12">
        <PageHeader
          title="Billing & payouts"
          description="Where your card payments land, what you earned each week, refunds, featured boosts and verification."
        />

        {owned.map((b) => (
          <section key={b.id} className="space-y-4 rounded-2xl border border-border p-5">
            <h2 className="text-lg font-medium">{b.display_name}</h2>
            <div className="space-y-6">
              {b.business_type === "food_vendor" ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Payout account</h3>
                  <PayoutForm businessId={b.id} current={paymentMethod(b.id)} />
                </div>
              ) : null}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Verification</h3>
                <VerificationPanel
                  businessId={b.id}
                  ownerId={user.id}
                  state={{
                    level: levels?.find((l) => l.id === b.id)?.verification_level ?? "basic",
                    label: levels?.find((l) => l.id === b.id)?.verification_label ?? null,
                    pending: (verReqs ?? []).some((v) => v.business_id === b.id && v.status === "pending"),
                    lastStatus: (verReqs ?? []).find((v) => v.business_id === b.id)?.status ?? null,
                    lastNote: (verReqs ?? []).find((v) => v.business_id === b.id)?.note ?? null,
                  }}
                />
              </div>
            </div>
          </section>
        ))}

        {kitchens.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Earnings by week</h2>
            {!weekRows.length ? (
              <EmptyState title="No completed orders yet" description="Weekly totals appear once orders are completed." />
            ) : (
              <div className="divide-y divide-border rounded-md border border-border text-sm">
                {weekRows.map(([week, w]) => (
                  <div key={week} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                    <span className="font-medium">Week of {new Date(week).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                    <span className="text-muted">
                      {w.count} orders · ₦{w.sales.toLocaleString()} (card ₦{w.card.toLocaleString()} · cash ₦{w.cash.toLocaleString()})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {refunds?.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Refund requests</h2>
            <RefundList refunds={refunds as unknown as RefundRow[]} isOwner />
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Featured boosts</h2>
            <Link href="/boosts" className="text-sm underline underline-offset-2">
              {boosts?.length ? `${boosts.length} waiting for payment` : "Feature a listing"}
            </Link>
          </div>
          <p className="text-sm text-muted">Pin a listing at the top of student search for a few days. Boosts never change your verification.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Payments</h2>
          {!ledger?.length ? (
            <EmptyState title="No payments yet" description="Card orders and boosts appear here once paid." />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {ledger.map((row) => (
                <div key={row.id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="capitalize">{(row.purpose || "payment").replace("_", " ")}</span>
                    <span className="text-muted"> · {new Date(row.created_at).toLocaleDateString()}</span>
                  </span>
                  <span className="text-muted">
                    ₦{Number(row.amount).toLocaleString()} · {row.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {plans?.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Subscriptions</h2>
            <div className="divide-y divide-border rounded-md border border-border">
              {plans.map((plan) => (
                <div key={plan.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{plan.plan_code}</p>
                  <p className="text-muted">
                    {plan.status}
                    {plan.ends_at ? ` · ends ${new Date(plan.ends_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Container>
  );
}
