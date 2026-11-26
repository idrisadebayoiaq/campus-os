import { redirect } from "next/navigation";
import { Suspense } from "react";
import { VerificationPanel } from "@/components/billing-panels";
import { PlanCard, type PlanCardState } from "@/components/plan-card";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plan" };
export const instant = false;

type PlanRpc = {
  active: boolean;
  ends_at: string | null;
  in_grace: boolean;
  auto_renew: boolean;
  card: { brand: string | null; last4: string | null; exp: string } | null;
  price: number;
};

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businesses = (await myBusinesses(supabase, user.id)).filter((b) => canManage(b.role));
  if (!businesses.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No business yet" description="Finish setting up your business to see the plan." />
        </div>
      </Container>
    );
  }
  const ids = businesses.map((b) => b.id);

  const [rows, balances, { data: verReqs }, { data: levels }] = await Promise.all([
    Promise.all(
      businesses.map(async (b) => {
        const { data } = await supabase.rpc("business_plan_state", { p_business: b.id });
        return [b.id, data as PlanRpc | null] as const;
      }),
    ),
    Promise.all(
      businesses.map(async (b) => {
        if (b.role !== "owner") return [b.id, 0] as const;
        const { data } = await supabase.rpc("business_balance", { p_business: b.id });
        return [b.id, Number(data ?? 0)] as const;
      }),
    ),
    supabase.from("verification_requests").select("business_id, status, note, created_at").in("business_id", ids).order("created_at", { ascending: false }),
    supabase.from("business_profiles").select("id, verification_level, verification_label").in("id", ids),
  ]);
  const stateOf = new Map(rows);
  const balanceOf = new Map(balances);

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Plan"
          description="Premium Business unlocks payment requests and everything that helps students find and trust you."
        />

        {businesses.map((b) => {
          const s = stateOf.get(b.id);
          const state: PlanCardState = {
            active: Boolean(s?.active),
            endsAt: s?.ends_at ?? null,
            inGrace: Boolean(s?.in_grace),
            autoRenew: Boolean(s?.auto_renew),
            card: s?.card ?? null,
          };
          return (
            <Suspense key={b.id} fallback={null}>
              <PlanCard
                businessId={b.id}
                businessName={b.display_name}
                price={Number(s?.price ?? 3000)}
                balance={balanceOf.get(b.id) ?? 0}
                state={state}
                isOwner={b.role === "owner"}
              />
            </Suspense>
          );
        })}

        {businesses
          .filter((b) => b.role === "owner")
          .map((b) => (
            <section key={b.id} className="space-y-3 rounded-3xl border border-border p-5 sm:p-7">
              <div>
                <h2 className="text-lg font-semibold">Verification badge</h2>
                <p className="text-sm text-muted">
                  {b.display_name} · Separate from Premium. A verified badge shows CampusOS checked your CAC documents.
                </p>
              </div>
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
            </section>
          ))}
      </div>
    </Container>
  );
}
