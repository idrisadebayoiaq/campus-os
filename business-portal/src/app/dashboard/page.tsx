import { redirect } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
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

  const roleList = (roles ?? []).map((row) => row.role).join(", ") || "student";

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
        <PageHeader title="Dashboard" description="CampusOS Portal" />

        <CampusScene
          mode="business"
          title="Campus zones"
          heightClass="h-44 sm:h-56"
          defaultOpen={false}
        />

        <div className="rounded-md border border-border px-4 py-3 text-sm">
          <p className="font-medium">{user.email}</p>
          <p className="mt-1 text-muted">Roles: {roleList}</p>
        </div>

        <section className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { href: "/apply", title: "Apply" },
            { href: "/listings", title: "Listings" },
            { href: "/listings/orders", title: "Orders" },
            { href: "/listings/inspections", title: "Inspections" },
            { href: "/billing", title: "Billing" },
            { href: "/admin", title: "Admin" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md border border-border px-2 py-3 text-center text-xs font-medium hover:bg-surface"
            >
              {item.title}
            </a>
          ))}
        </section>

        {needsSetup ? (
          <div className="rounded-md border border-border bg-surface p-5">
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
            <div className="divide-y divide-border rounded-md border border-border">
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
            <div className="divide-y divide-border rounded-md border border-border">
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
                      {biz.slug ? (
                        <ButtonLink
                          href={`${process.env.NEXT_PUBLIC_STUDENT_URL || "http://localhost:3000"}/businesses/${biz.slug}`}
                          variant="ghost"
                        >
                          Public page
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
