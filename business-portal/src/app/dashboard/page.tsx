import { redirect } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";
import { SignOutButton } from "@/components/sign-out-button";
import { TodayCard, type Today } from "@/components/today-card";
import { myBusinesses } from "@/lib/business";
import { ButtonLink, Container, EmptyState } from "@/components/ui";
import { loadAccess } from "@/lib/access";
import { businessTypeLabel } from "@/lib/business-types";
import { dashboardLinks } from "@/lib/nav";
import {
  PERSONA_LABEL,
  hasBusiness,
  isAdminOnly,
  isBusinessPersona,
  isSupportOnly,
  pendingBusinessPersonas,
  type Persona,
} from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };
export const instant = false;

const TYPE_KEY: Record<string, string> = {
  housing: "housing_provider",
  restaurant: "food_vendor",
  service: "campus_service",
  seller: "marketplace_seller",
};

const HEADLINE: Record<Persona, { title: string; body: string }> = {
  housing: {
    title: "Manage your rooms",
    body: "Add properties, upload photos and videos, and answer inspection requests.",
  },
  restaurant: {
    title: "Run your restaurant",
    body: "Keep your menu up to date and handle pickup orders from students.",
  },
  service: {
    title: "Manage your services",
    body: "Post services and respond to students on your campus.",
  },
  seller: {
    title: "Manage your shop",
    body: "List goods for students on your campus and respond to buyers.",
  },
  lecturer: {
    title: "Teach on CampusOS",
    body: "Run your classes and send announcements to your students.",
  },
  school: {
    title: "School administration",
    body: "Verify students, manage departments and approve lecturers.",
  },
  admin: { title: "Admin", body: "Platform administration." },
  support: { title: "Support desk", body: "Answer support requests from students and businesses." },
  applicant: {
    title: "Welcome to CampusOS",
    body: "Tell us what you do on campus and we'll set up the right tools for you.",
  },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await loadAccess(supabase, user.id);
  const { personas } = access;
  if (isSupportOnly(personas)) redirect("/support-desk");
  if (isAdminOnly(personas)) redirect("/admin");

  const primary = personas.find((p) => p !== "admin") ?? personas[0];
  const waitingSchool =
    primary === "applicant" && user.user_metadata?.signup_intent === "school";
  const waitingStaff =
    primary === "applicant" && user.user_metadata?.signup_intent === "staff";
  const headline = waitingSchool
    ? {
        title: "Waiting for your school",
        body: "CampusOS admin will link your account to your school. Once that's done your school tools appear here automatically.",
      }
    : waitingStaff
      ? {
          title: "Your account is ready",
          body: "An admin gives you access to your tools, like the Support desk or Admin. Ask your admin to add your email. You can also apply as a business any time.",
        }
      : HEADLINE[primary];
  const quickLinks = dashboardLinks(personas);
  const businessOwner = hasBusiness(personas);

  const [{ data: applications }, { data: businesses }] = await Promise.all([
    supabase
      .from("business_applications")
      .select("id, business_name, business_type, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("business_profiles")
      .select("id, display_name, business_type, setup_complete, setup_step")
      .eq("owner_user_id", user.id),
  ]);

  const publishFlags: Record<string, boolean> = {};
  for (const biz of businesses ?? []) {
    const { data } = await supabase.rpc("business_can_publish", { biz_id: biz.id });
    publishFlags[biz.id] = Boolean(data);
  }
  const needsSetup = (businesses ?? []).find((b) => !b.setup_complete);

  // Small stat counters, scoped to this kind of account.
  const stats: { label: string; value: number }[] = [];
  const bizIds = (businesses ?? []).map((b) => b.id);
  if (bizIds.length) {
    if (personas.includes("housing")) {
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .in("business_id", bizIds);
      stats.push({ label: "Properties", value: count ?? 0 });
    }
    if (personas.includes("restaurant")) {
      const { count } = await supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .in("business_id", bizIds);
      stats.push({ label: "Menu items", value: count ?? 0 });
    }
    if (personas.includes("service") || personas.includes("seller")) {
      const { count } = await supabase
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .in("business_id", bizIds);
      stats.push({ label: "Listings", value: count ?? 0 });
    }
  }
  if (personas.includes("school")) {
    const [{ count: lecturers }, { count: ids }] = await Promise.all([
      supabase
        .from("lecturer_applications")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "submitted", "under_review"]),
      supabase
        .from("student_verifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    stats.push({ label: "Lecturer requests", value: lecturers ?? 0 });
    stats.push({ label: "Student ID reviews", value: ids ?? 0 });
  }

  const teamBusinesses = (await myBusinesses(supabase, user.id)).filter((b) => b.setup_complete);
  const today = await Promise.all(
    teamBusinesses.map(async (b) => {
      const { data } = await supabase.rpc("business_today", { p_business: b.id });
      return { business: b, data: (data ?? null) as Today | null };
    }),
  );

  const pendingPersonas = pendingBusinessPersonas(access);
  const applyHref = pendingPersonas[0]
    ? `/apply/${TYPE_KEY[pendingPersonas[0]]}`
    : "/apply";

  return (
    <Container className="space-y-8 py-8">
      <section className="overflow-hidden rounded-3xl bg-hero-bg p-6 text-hero-fg sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-hero-muted">
          {personas.map((p) => PERSONA_LABEL[p]).join(" · ")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {headline.title}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-hero-muted">{headline.body}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {waitingSchool ? null : primary === "applicant" ? (
            <a
              href={applyHref}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
            >
              {pendingPersonas[0] ? "Continue your application" : "Get started"}
            </a>
          ) : (
            quickLinks.slice(0, 3).map((item) => (
              <a
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
              >
                {item.label}
              </a>
            ))
          )}
        </div>
      </section>

      {today.map(({ business, data }) =>
        data ? <TodayCard key={business.id} business={business} today={data} /> : null,
      )}

      {stats.length ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-surface px-4 py-4">
              <p className="text-2xl font-semibold">{s.value}</p>
              <p className="text-xs text-muted">{s.label}</p>
            </div>
          ))}
        </section>
      ) : null}

      {primary !== "applicant" && quickLinks.length ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <a
              key={`${item.href}-${item.label}`}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4 text-sm font-medium hover:border-accent"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
                <NavIcon name={item.icon} />
              </span>
              <span className="truncate">{item.label}</span>
            </a>
          ))}
        </section>
      ) : null}

      {needsSetup && personas.some(isBusinessPersona) ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="font-medium">Finish setup to unlock publishing</p>
          <p className="mt-2 text-sm text-muted">
            {needsSetup.display_name} still needs profile, hours, contact, payment, and policy
            confirmation.
          </p>
          <div className="mt-4">
            <ButtonLink href={`/setup/${needsSetup.id}`}>Continue setup</ButtonLink>
          </div>
        </div>
      ) : null}

      {personas.includes("lecturer") ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
          <p className="font-medium">Your classes</p>
          <p className="mt-1 text-muted">Create classes, share a join code, and post announcements.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/classes">Open classes</ButtonLink>
            <ButtonLink href="/announcements" variant="secondary">
              Announcements
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {waitingSchool ? (
        <EmptyState
          title="Registration pending"
          description={`Ask CampusOS admin to register ${user.email} as the authority for your school.`}
        />
      ) : null}

      {!waitingSchool && (primary === "applicant" || applications?.length) ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Your application</h2>
          {!applications?.length ? (
            <EmptyState
              title="No application yet"
              description="Choose what you do on campus and submit your details for review."
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
                    <span className="text-muted"> · {businessTypeLabel(app.business_type)}</span>
                  </span>
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">
                    {app.status.replace("_", " ")}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {businessOwner ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Your business</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {(businesses ?? []).map((biz) => {
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
                  </div>
                  <ButtonLink href={`/setup/${biz.id}`} variant="secondary">
                    {biz.setup_complete ? "Edit business profile" : "Continue setup"}
                  </ButtonLink>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
            <NavIcon name="support" />
          </span>
          <div>
            <p className="font-medium">Need help?</p>
            <p className="mt-1 text-sm text-muted">
              Get an instant answer from the CampusOS Assistant, or chat with the support team.
            </p>
          </div>
        </div>
        <ButtonLink href="/support" variant="secondary">
          Help & support
        </ButtonLink>
      </section>

      <div className="flex flex-wrap gap-3">
        <SignOutButton />
      </div>
    </Container>
  );
}
