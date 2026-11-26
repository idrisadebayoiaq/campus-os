import Link from "next/link";
import { redirect } from "next/navigation";
import { Container, EmptyState } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin dashboard" };
export const instant = false;

type Stats = {
  users: number;
  businesses: number;
  pending_business: number;
  pending_lecturers: number;
  pending_verifications: number;
  open_reports: number;
  schools: number;
  published_properties: number;
  active_listings: number;
  orders: number;
};

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState
            title="Staff only"
            description="Your account needs an admin or moderator role to open the admin dashboard."
          />
        </div>
      </Container>
    );
  }

  const [{ data: statsData }, { data: pending }, { data: recentUsers }] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase
      .from("business_applications")
      .select("id, business_name, business_type, status, submitted_at")
      .in("status", ["submitted", "under_review"])
      .order("submitted_at", { ascending: false })
      .limit(6),
    supabase.rpc("admin_list_users", { search: null }),
  ]);

  const stats = (statsData ?? {}) as Partial<Stats>;
  const n = (v: number | undefined) => v ?? 0;

  const queues = [
    { href: "/admin/applications", label: "Business applications", value: n(stats.pending_business), hot: true },
    { href: "/admin/lecturers", label: "Lecturer applications", value: n(stats.pending_lecturers), hot: true },
    { href: "/school/verifications", label: "Student ID reviews", value: n(stats.pending_verifications), hot: true },
    { href: "/admin/reports", label: "Open reports", value: n(stats.open_reports), hot: true },
  ];

  const totals = [
    { label: "Users", value: n(stats.users) },
    { label: "Businesses", value: n(stats.businesses) },
    { label: "Schools", value: n(stats.schools) },
    { label: "Published rooms", value: n(stats.published_properties) },
    { label: "Market listings", value: n(stats.active_listings) },
    { label: "Food orders", value: n(stats.orders) },
  ];

  const tools = [
    { href: "/admin/users", title: "Users & roles", body: "Search accounts, grant or revoke roles." },
    { href: "/admin/applications", title: "Businesses", body: "Approve, reject, or request changes." },
    { href: "/admin/lecturers", title: "Lecturers", body: "Review lecturer applications." },
    { href: "/school/verifications", title: "Student IDs", body: "Verify campus ID uploads." },
    { href: "/admin/listings", title: "Listings", body: "Moderate housing and marketplace inventory." },
    { href: "/admin/reports", title: "Reports", body: "Clear fraud and listing reports." },
    { href: "/admin/schools", title: "Schools", body: "Register and manage institutions." },
    { href: "/inbox", title: "Inbox", body: "Messages from students and businesses." },
  ];

  return (
    <Container className="space-y-8 py-8">
      <section className="rounded-3xl bg-hero-bg p-6 text-hero-fg sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-hero-muted">
          CampusOS Admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Admin dashboard
        </h1>
        <p className="mt-2 max-w-xl text-sm text-hero-muted">
          Signed in as {user.email}. Everything waiting for review is below.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {queues.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className={`rounded-2xl border p-4 transition hover:border-accent ${
              q.value > 0 ? "border-accent bg-accent-soft" : "border-border bg-surface"
            }`}
          >
            <p className="text-3xl font-semibold tracking-tight">{q.value}</p>
            <p className="mt-1 text-sm text-muted">{q.label}</p>
            <p className="mt-2 text-xs font-semibold text-fg">
              {q.value > 0 ? "Review now →" : "All clear"}
            </p>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {totals.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-xl font-semibold">{t.value}</p>
            <p className="text-xs text-muted">{t.label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Waiting for review</h2>
            <Link href="/admin/applications" className="text-sm text-muted hover:text-fg">
              View all
            </Link>
          </div>
          {!pending?.length ? (
            <EmptyState title="Nothing pending" description="New business applications appear here." />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {pending.map((app) => (
                <Link
                  key={app.id}
                  href={`/admin/applications/${app.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{app.business_name}</span>
                    <span className="block truncate text-xs text-muted">
                      {businessTypeLabel(app.business_type)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">
                    {app.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Newest users</h2>
            <Link href="/admin/users" className="text-sm text-muted hover:text-fg">
              Manage roles
            </Link>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {(recentUsers ?? []).slice(0, 6).map((u: { id: string; email: string; roles: string[] }) => (
              <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate">{u.email}</span>
                <span className="shrink-0 text-xs text-muted">{u.roles.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Admin tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-2xl border border-border bg-surface p-4 transition hover:border-accent"
            >
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{t.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </Container>
  );
}
