import { redirect } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink, Container, EmptyState } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
import { dashboardLinks } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };
export const instant = false;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roleNames = (roles ?? []).map((row) => String(row.role));
  const roleList = roleNames.join(", ") || "student";
  const quickLinks = dashboardLinks(roleNames);

  const { data: applications } = await supabase
    .from("business_applications")
    .select("id, business_name, business_type, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: businesses } = await supabase
    .from("business_profiles")
    .select("id, display_name, business_type, setup_complete, setup_step, slug")
    .eq("owner_user_id", user.id);

  const publishFlags: Record<string, boolean> = {};
  for (const biz of businesses ?? []) {
    const { data } = await supabase.rpc("business_can_publish", { biz_id: biz.id });
    publishFlags[biz.id] = Boolean(data);
  }

  const needsSetup = (businesses ?? []).find((b) => !b.setup_complete);

  return (
    <Container>
      <div className="space-y-8 py-12">
        <section className="overflow-hidden rounded-3xl bg-hero-bg p-6 text-hero-fg sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-hero-muted">
            CampusOS Portal
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 max-w-xl text-sm text-hero-muted">
            {user.email} · {roleList}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {quickLinks.slice(0, 4).map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
              >
                {item.label}
              </a>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4 text-sm font-medium hover:border-accent"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
                <NavIcon name={item.icon} />
              </span>
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                <span className="block text-[11px] font-normal text-muted">{item.group}</span>
              </span>
            </a>
          ))}
        </section>
        {needsSetup ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="font-medium">Finish setup to unlock publishing</p>
            <p className="mt-2 text-sm text-muted">
              {needsSetup.display_name} still needs profile, hours, contact, payment,
              and policy confirmation.
            </p>
            <div className="mt-4">
              <ButtonLink href={`/setup/${needsSetup.id}`}>Continue setup</ButtonLink>
            </div>
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Your applications</h2>
          {!applications?.length ? (
            <EmptyState
              title="No applications yet"
              description="Apply as a business to get reviewed by CampusOS admin."
            />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {applications.map((app) => (
                <a
                  key={app.id}
                  href={`/applications/${app.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface"
                >
                  <span>
                    {app.business_name}
                    <span className="text-muted">
                      {" "}
                      · {businessTypeLabel(app.business_type)}
                    </span>
                  </span>
                  <span className="text-muted">{app.status}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Approved businesses</h2>
          {!businesses?.length ? (
            <EmptyState
              title="No approved business yet"
              description="After approval, your business profile appears here for setup and listing."
            />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {businesses.map((biz) => {
                const canPublish = publishFlags[biz.id];
                return (
                  <div
                    key={biz.id}
                    className="flex flex-col gap-3 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{biz.display_name}</p>
                      <p className="text-muted">
                        {businessTypeLabel(biz.business_type)} ·{" "}
                        {biz.setup_complete
                          ? canPublish
                            ? "Ready to publish"
                            : "Setup incomplete (payment/policies)"
                          : `Setup in progress (${biz.setup_step})`}
                      </p>
                      {!canPublish ? (
                        <p className="mt-1 text-xs text-warn">
                          Publish gate locked until setup is complete.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-success">
                          Publish unlocked on CampusOS.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ButtonLink href={`/setup/${biz.id}`} variant="secondary">
                        {biz.setup_complete ? "Edit setup" : "Continue setup"}
                      </ButtonLink>
                      {canPublish ? (
                        <ButtonLink href="/listings" variant="secondary">
                          Manage listings
                        </ButtonLink>
                      ) : null}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/apply" variant="secondary">
            Apply as business
          </ButtonLink>
          <SignOutButton />
        </div>
      </div>
    </Container>
  );
}
