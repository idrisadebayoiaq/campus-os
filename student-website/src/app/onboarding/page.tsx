import { redirect } from "next/navigation";
import { ProgressiveOnboarding } from "@/components/progressive-onboarding";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Onboarding" };
export const instant = false;

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: institutions }, { data: departments }, { data: sessions }, { data: progress }, { data: student }] =
    await Promise.all([
      supabase
        .from("institutions")
        .select("id, name, short_name, institution_type, campuses(id, name, city, state)")
        .eq("is_active", true)
        .in("institution_type", [
          "university",
          "polytechnic",
          "college_of_education",
          "college",
          "monotechnic",
          "other",
        ])
        .order("name")
        .limit(1000),
      supabase.from("departments").select("id, name, institution_id").order("name"),
      supabase.from("academic_sessions").select("id, label, institution_id").order("label"),
      supabase
        .from("onboarding_progress")
        .select("current_step, is_complete")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("student_profiles")
        .select("student_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  return (
    <Container>
      <div className="mx-auto max-w-lg space-y-8 py-12">
        <PageHeader
          title={progress?.is_complete ? "Update your CampusOS profile" : "Welcome to CampusOS"}
          description="Optional — skip anytime."
        />
        <ProgressiveOnboarding
          institutions={institutions ?? []}
          departments={departments ?? []}
          sessions={sessions ?? []}
          initialStep={progress?.is_complete ? "status" : progress?.current_step || "status"}
          studentStatus={student?.student_status}
        />
      </div>
    </Container>
  );
}
