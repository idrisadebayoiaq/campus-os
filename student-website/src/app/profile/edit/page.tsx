import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfilePreferences } from "@/components/profile-preferences";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit profile" };
export const instant = false;

export default async function ProfileEditPage({
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

  const [{ data: student }, { data: prefs }, { data: housing }, { data: notif }] =
    await Promise.all([
      supabase.from("student_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("student_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("housing_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-10">
        <div className="flex items-center justify-between gap-3">
          <PageHeader
            title="Edit profile"
            description="Update academics, housing, and preferences."
          />
          <Link href="/profile" className="text-sm text-muted underline underline-offset-2">
            Back
          </Link>
        </div>

        <section className="rounded-2xl border border-border bg-surface px-4 py-4">
          <p className="text-sm font-medium">Setup wizard</p>
          <p className="mt-1 text-sm text-muted">
            Fill school and academic details in one pass.
          </p>
          <div className="mt-3">
            <ButtonLink href="/onboarding" variant="secondary">
              Open setup wizard
            </ButtonLink>
          </div>
        </section>

        <ProfilePreferences
          focus={setup || null}
          student={student}
          prefs={prefs}
          housing={housing}
          notifications={notif}
        />
      </div>
    </Container>
  );
}
