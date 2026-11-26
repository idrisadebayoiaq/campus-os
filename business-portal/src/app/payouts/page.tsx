import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BalancePanel,
  PayoutForm,
  RefundList,
  type PayoutAccount,
  type PayoutRow,
  type RefundRow,
} from "@/components/billing-panels";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payouts" };
export const instant = false;

function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default async function PayoutsPage() {
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
          <EmptyState title="Owner only" description="Payouts and refunds are managed by the business owner." />
        </div>
      </Container>
    );
  }
  const ids = owned.map((b) => b.id);
  const kitchens = owned.filter((b) => b.business_type === "food_vendor");
  const since = new Date(Date.now() - 8 * 7 * 86400_000).toISOString();

  const [balances, { data: payoutRows }, { data: minSetting }, { data: methods }, { data: refunds }, { data: ledger }, { data: orders }] = await Promise.all([
    Promise.all(
      owned.map(async (k) => {
        const { data } = await supabase.rpc("business_balance", { p_business: k.id });
        return [k.id, Number(data ?? 0)] as const;
      }),
    ),
    supabase.from("payouts").select("id, business_id, amount, status, failure_reason, created_at").in("business_id", ids).order("created_at", { ascending: false }).limit(40),
    supabase.rpc("setting_num", { p_key: "payout_min", p_default: 5000 }),
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
      .neq("purpose", "subscription")
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
  ]);

  const balanceOf = new Map(balances);
  const payoutMin = Number(minSetting ?? 5000);
  const methodOf = (id: string) => ((methods ?? []).find((p) => p.business_id === id) as PayoutAccount | undefined) ?? null;

  const weeks = new Map<string, { sales: number; card: number; cash: number; wallet: number; count: number }>();
  for (const o of orders ?? []) {
    const key = weekStart(new Date(o.created_at)).toISOString().slice(0, 10);
    const w = weeks.get(key) ?? { sales: 0, card: 0, cash: 0, wallet: 0, count: 0 };
    const t = Number(o.total);
    w.sales += t;
    w.count += 1;
    if (o.payment_method === "card" && o.payment_status === "paid") w.card += t;
    else if (o.payment_method === "wallet") w.wallet += t;
    else w.cash += t;
    weeks.set(key, w);
  }
  const weekRows = [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader title="Payouts" description="Your CampusOS balance, the bank account your money is sent to, and a record of what you have earned." />

        {owned.map((b) => (
          <section key={b.id} className="space-y-6 rounded-3xl border border-border p-5 sm:p-7">
            <h2 className="text-lg font-semibold">{b.display_name}</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Balance and withdrawals</h3>
              <BalancePanel
                businessId={b.id}
                balance={balanceOf.get(b.id) ?? 0}
                minimum={payoutMin}
                hasBank={Boolean(methodOf(b.id)?.is_verified)}
                payouts={(payoutRows ?? []).filter((p) => p.business_id === b.id) as unknown as PayoutRow[]}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Bank account for payouts</h3>
              <PayoutForm businessId={b.id} current={methodOf(b.id)} />
            </div>
          </section>
        ))}

        {kitchens.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Earnings by week</h2>
            {!weekRows.length ? (
              <EmptyState title="No completed orders yet" description="Weekly totals appear once orders are completed." />
            ) : (
              <div className="divide-y divide-border rounded-2xl border border-border text-sm">
                {weekRows.map(([week, w]) => (
                  <div key={week} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                    <span className="font-medium">Week of {new Date(week).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                    <span className="text-muted">
                      {w.count} orders · ₦{w.sales.toLocaleString()} (card ₦{w.card.toLocaleString()} · wallet ₦{w.wallet.toLocaleString()} · cash ₦{w.cash.toLocaleString()})
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
          <h2 className="text-lg font-medium">Payments</h2>
          {!ledger?.length ? (
            <EmptyState title="No payments yet" description="Card orders and boosts appear here once paid." />
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border text-sm">
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
          <p className="text-sm text-muted">
            Plan payments are on the{" "}
            <Link href="/plan" className="underline underline-offset-2">
              Plan page
            </Link>
            .
          </p>
        </section>
      </div>
    </Container>
  );
}
