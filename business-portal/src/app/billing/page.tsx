import { redirect } from "next/navigation";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Billing" };
export const instant = false;

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: businesses } = await supabase
    .from("business_profiles")
    .select("id, display_name")
    .eq("owner_user_id", user.id);

  const ids = (businesses ?? []).map((b) => b.id);
  const { data: plans } = ids.length
    ? await supabase
        .from("subscription_plans")
        .select("*")
        .in("business_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  const { data: ledger } = ids.length
    ? await supabase
        .from("payment_ledger")
        .select("*")
        .in("business_id", ids)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] as never[] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Billing"
          description="CampusOS housing subscriptions via Paystack. Student search stays free."
        />

        <div className="rounded-md border border-border bg-surface p-5 text-sm leading-6 text-muted">
          <p className="font-medium text-fg">Provider plan (pilot policy)</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Trial then paid listing quota for housing providers</li>
            <li>Premium placement never changes verification score</li>
            <li>Paystack webhooks will write to the payment ledger (stub ready)</li>
          </ul>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Subscriptions</h2>
          {!plans?.length ? (
            <EmptyState
              title="No subscription yet"
              description="Plans activate when Paystack billing is connected for your CampusOS business."
            />
          ) : (
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
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Payment ledger</h2>
          {!ledger?.length ? (
            <EmptyState
              title="No payments recorded"
              description="Verified Paystack events will appear here with idempotent ledger rows."
            />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {ledger.map((row) => (
                <div key={row.id} className="flex justify-between px-4 py-3 text-sm">
                  <span>
                    {row.provider} · {row.reference}
                  </span>
                  <span className="text-muted">
                    ₦{Number(row.amount).toLocaleString()} · {row.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Container>
  );
}
