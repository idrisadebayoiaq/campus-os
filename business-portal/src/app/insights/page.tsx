import Link from "next/link";
import { redirect } from "next/navigation";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses, type MyBusiness } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Insights" };
export const instant = false;

type Insights = {
  days: number;
  views: number;
  saves: number;
  chats: number;
  enquiries: number;
  viewings: number;
  orders: number;
  revenue: number;
  rating: { avg: number | null; count: number } | null;
  daily: { day: string; views: number; orders: number }[];
  top_items: { name: string; quantity: number; revenue: number }[];
  peak_hours: { hour: number; orders: number }[];
  top_listings: { title: string; views: number; entity_type: string }[];
};

function Bars({ data, label }: { data: { key: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={label}>
        {data.map((d) => (
          <div key={d.key} className="flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} title={`${d.key}: ${d.value}`} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function pct(a: number, b: number) {
  return b > 0 ? `${Math.round((a / b) * 100)}%` : "–";
}

function Section({ business, i }: { business: MyBusiness; i: Insights }) {
  const food = business.business_type === "food_vendor";
  const housing = business.business_type === "housing_provider";
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-medium">{business.display_name}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Views" value={i.views} />
        {housing ? <Stat label="Saved by students" value={i.saves} /> : null}
        {!food ? <Stat label="Enquiries" value={i.enquiries} /> : null}
        {housing ? <Stat label="Viewing requests" value={i.viewings} hint={`${pct(i.viewings, i.views)} of views`} /> : null}
        {food ? <Stat label="Orders" value={i.orders} hint={`${pct(i.orders, i.views)} of views`} /> : null}
        {food ? <Stat label="Sales" value={`₦${Number(i.revenue).toLocaleString()}`} /> : null}
        <Stat label="Rating" value={i.rating?.count ? `★ ${i.rating.avg}` : "–"} hint={i.rating?.count ? `${i.rating.count} reviews` : "No reviews yet"} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Bars label="Views per day" data={i.daily.map((d) => ({ key: d.day, value: d.views }))} />
        {food ? <Bars label="Orders per day" data={i.daily.map((d) => ({ key: d.day, value: d.orders }))} /> : null}
      </div>
      {food && i.peak_hours.length ? (
        <Bars
          label="Busiest hours (orders by hour of day)"
          data={Array.from({ length: 24 }, (_, h) => ({ key: `${h}:00`, value: i.peak_hours.find((p) => p.hour === h)?.orders ?? 0 }))}
        />
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2">
        {food && i.top_items.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Best sellers</p>
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {i.top_items.map((t) => (
                <div key={t.name} className="flex justify-between px-3 py-2">
                  <span>{t.name}</span>
                  <span className="text-muted">
                    {t.quantity} sold · ₦{Number(t.revenue).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {i.top_listings.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Most viewed</p>
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {i.top_listings.map((t, idx) => (
                <div key={`${t.title}-${idx}`} className="flex justify-between px-3 py-2">
                  <span>{t.title}</span>
                  <span className="text-muted">{t.views} views</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {i.views === 0 ? (
        <p className="text-sm text-muted">Views are counted from the latest student app. Numbers fill in as students browse.</p>
      ) : null}
    </section>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: daysParam } = await searchParams;
  const days = [7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businesses = (await myBusinesses(supabase, user.id)).filter((b) => b.setup_complete && canManage(b.role));
  if (!businesses.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No insights yet" description="Owners and managers of a set-up business can see how listings perform." />
        </div>
      </Container>
    );
  }

  const results = await Promise.all(
    businesses.map(async (b) => {
      const { data: plan } = await supabase.rpc("business_plan_state", { p_business: b.id });
      const p = plan as { active?: boolean; in_grace?: boolean } | null;
      const unlocked = Boolean(p?.active || p?.in_grace);
      return {
        business: b,
        unlocked,
        data: unlocked ? ((await supabase.rpc("business_insights", { p_business: b.id, p_days: days })).data as Insights | null) : null,
      };
    }),
  );

  return (
    <Container>
      <div className="space-y-10 py-8 sm:py-12">
        <PageHeader title="Insights" description="How students find and use your listings." />
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/insights?days=${d}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${d === days ? "bg-accent text-on-accent" : "border border-border"}`}
            >
              Last {d} days
            </Link>
          ))}
        </div>
        {results.map(({ business, data, unlocked }) =>
            !unlocked ? (
              <section key={business.id} className="space-y-3 rounded-3xl border border-border p-6">
                <h2 className="text-lg font-medium">{business.display_name}</h2>
                <p className="text-sm text-muted">Insights are part of Premium Business. See views, saves, chats, orders and revenue for your listings.</p>
                <Link href="/plan" className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-on-accent">
                  See the plan
                </Link>
              </section>
            ) : data ? (
              <Section key={business.id} business={business} i={data} />
            ) : null,
          )}
      </div>
    </Container>
  );
}
