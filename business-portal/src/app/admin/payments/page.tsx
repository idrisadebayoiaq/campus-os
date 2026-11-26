import { redirect } from "next/navigation";
import { PaymentSettings, PaystackStatus, type SettingRow } from "@/components/payment-settings";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Money" };
export const instant = false;

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export default async function AdminPaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  const isStaff = isAdmin || (roles ?? []).some((r) => r.role === "moderator");
  if (!isStaff) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="Staff only" description="Platform money settings are limited to CampusOS staff." />
        </div>
      </Container>
    );
  }

  const [{ data: settings }, { data: wallets }, { data: entries }, { data: payouts }, { data: problems }] = await Promise.all([
    supabase.from("platform_settings").select("key, value, description").order("key"),
    supabase.from("wallets").select("balance"),
    supabase.from("business_entries").select("amount"),
    supabase.from("payouts").select("id, amount, status, failure_reason, created_at, business_profiles(display_name)").order("created_at", { ascending: false }).limit(20),
    supabase
      .from("payment_ledger")
      .select("id, reference, amount, status, purpose, created_at")
      .in("status", ["amount_mismatch", "failed"])
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const walletTotal = (wallets ?? []).reduce((s, w) => s + Number(w.balance), 0);
  const kitchenTotal = (entries ?? []).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <Container>
      <div className="space-y-10 py-8 sm:py-12">
        <PageHeader title="Money" description="Wallet, commissions, withdrawals and Paystack. Changes apply to new payments straight away." />

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Paystack</h2>
          <PaystackStatus />
          <p className="text-sm text-muted">
            Payments are confirmed by the app when students come back and by a check that runs every 2 minutes, so the Paystack webhook is optional.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-4">
            <p className="text-xs uppercase tracking-wider text-muted">Owed to students (all wallets)</p>
            <p className="text-2xl font-semibold">{naira(walletTotal)}</p>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <p className="text-xs uppercase tracking-wider text-muted">Owed to kitchens (not yet withdrawn)</p>
            <p className="text-2xl font-semibold">{naira(kitchenTotal)}</p>
          </div>
        </section>
        <p className="-mt-6 text-sm text-muted">Keep your Paystack balance above these two numbers combined so every withdrawal can be paid.</p>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Settings</h2>
          <PaymentSettings rows={(settings ?? []) as SettingRow[]} canEdit={isAdmin} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Recent withdrawals</h2>
          {!payouts?.length ? (
            <EmptyState title="No withdrawals yet" description="Kitchen withdrawals appear here." />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {payouts.map((p) => {
                const biz = Array.isArray(p.business_profiles) ? p.business_profiles[0] : p.business_profiles;
                return (
                  <div key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                    <span>
                      {biz?.display_name ?? "Kitchen"} · {naira(Number(p.amount))}
                      <span className="text-muted"> · {new Date(p.created_at).toLocaleDateString()}</span>
                    </span>
                    <span className={p.status === "failed" ? "text-red-600" : "text-muted"}>
                      {p.status}
                      {p.failure_reason ? ` · ${p.failure_reason}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Payments needing attention</h2>
          {!problems?.length ? (
            <EmptyState title="Nothing to fix" description="Failed or mismatched card payments show here." />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {problems.map((p) => (
                <div key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                  <span>
                    {p.reference} <span className="text-muted">· {p.purpose}</span>
                  </span>
                  <span className="text-muted">
                    {naira(Number(p.amount))} · {p.status}
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
