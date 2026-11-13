import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfilePreferences } from "@/components/profile-preferences";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Profile" };
export const instant = false;

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const { setup } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: student }, { data: prefs }, { data: housing }, { data: notif }, { data: membership }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, first_name, last_name, preferred_name, phone")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("student_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("student_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("housing_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("campus_memberships")
        .select("institutions(name, short_name), campuses(name, city, state)")
        .eq("user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle(),
    ]);

  const institution = Array.isArray(membership?.institutions)
    ? membership?.institutions[0]
    : membership?.institutions;
  const campus = Array.isArray(membership?.campuses)
    ? membership?.campuses[0]
    : membership?.campuses;

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title="Profile & settings"
          description="School, academics, and preferences."
        />

        <section className="rounded-md border border-border bg-surface px-4 py-4">
          <p className="text-sm font-medium">Setup</p>
          <p className="mt-1 text-sm text-muted">Fill school and academic details anytime.</p>
          <div className="mt-3">
            <ButtonLink href="/onboarding" variant="secondary">
              Open setup wizard
            </ButtonLink>
          </div>
        </section>

        <div className="space-y-4 rounded-md border border-border p-5 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Name</p>
            <p className="mt-1">
              {profile?.preferred_name || profile?.full_name || "—"}
              {profile?.first_name || profile?.last_name
                ? ` (${[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")})`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Email</p>
            <p className="mt-1">{user.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Campus</p>
            {institution && campus ? (
              <p className="mt-1">
                {institution.name}
                {institution.short_name ? ` (${institution.short_name})` : ""} · {campus.name}
              </p>
            ) : (
              <p className="mt-1 text-muted">Not set</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Verification</p>
            <p className="mt-1 capitalize">
              {(student?.verification_level || "basic").replaceAll("_", " ")} student account
            </p>
          </div>
        </div>

        <ProfilePreferences
          focus={setup || null}
          student={student}
          prefs={prefs}
          housing={housing}
          notifications={notif}
        />

        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/onboarding" variant="secondary">
            Edit setup wizard
          </ButtonLink>
          <Link href="/privacy" className="inline-flex h-11 items-center text-sm underline underline-offset-2">
            Privacy
          </Link>
          <SignOutButton />
        </div>
      </div>
    </Container>
  );
}
