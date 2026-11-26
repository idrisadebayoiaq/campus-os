import Link from "next/link";
import type { MyBusiness } from "@/lib/business";

export type Today = {
  orders_today: number;
  revenue_today: number;
  new_orders: number;
  in_kitchen: number;
  open_enquiries: number;
  viewings_pending: number;
  viewings_today: number;
  rent_due_soon: number;
  open_reports: number;
  rating: { avg: number | null; count: number } | null;
};

type Tile = { label: string; value: string; href: string; hot?: boolean };

export function TodayCard({ business, today }: { business: MyBusiness; today: Today }) {
  const tiles: Tile[] = [];

  if (business.business_type === "food_vendor") {
    tiles.push(
      { label: "New orders", value: String(today.new_orders), href: "/listings/orders", hot: today.new_orders > 0 },
      { label: "In the kitchen", value: String(today.in_kitchen), href: "/listings/orders" },
      { label: "Orders today", value: String(today.orders_today), href: "/listings/orders" },
      { label: "Sales today", value: `₦${Number(today.revenue_today).toLocaleString()}`, href: "/insights" },
    );
  }
  if (business.business_type === "housing_provider") {
    tiles.push(
      { label: "Viewing requests", value: String(today.viewings_pending), href: "/listings/inspections", hot: today.viewings_pending > 0 },
      { label: "Viewings today", value: String(today.viewings_today), href: "/listings/inspections" },
      { label: "Open enquiries", value: String(today.open_enquiries), href: "/listings/enquiries", hot: today.open_enquiries > 0 },
      { label: "Rent due this week", value: String(today.rent_due_soon), href: "/tenancies", hot: today.rent_due_soon > 0 },
    );
  }
  if (["campus_service", "marketplace_seller"].includes(business.business_type)) {
    tiles.push({ label: "Open enquiries", value: String(today.open_enquiries), href: "/listings/enquiries", hot: today.open_enquiries > 0 });
  }
  if (today.open_reports > 0) {
    tiles.push({ label: "Reports to answer", value: String(today.open_reports), href: "/reviews?tab=reports", hot: true });
  }

  if (!tiles.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Today · {business.display_name}</h2>
        <p className="text-xs text-muted">
          {today.rating?.count ? `★ ${today.rating.avg} (${today.rating.count} reviews)` : "No reviews yet"}
          {business.business_type === "food_vendor" ? ` · ${business.accepting_orders ? "Taking orders" : "Orders paused"}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`rounded-2xl border px-4 py-4 hover:border-accent ${t.hot ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
          >
            <p className="text-2xl font-semibold">{t.value}</p>
            <p className="text-xs text-muted">{t.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
