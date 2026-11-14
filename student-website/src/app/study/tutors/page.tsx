import { TutorsPanel } from "@/components/study/tutors-panel";
import { Container, PageHeader } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Peer tutors" };
export const instant = false;

export default async function TutorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const campus = user ? await getStudentCampus(supabase, user.id) : null;

  let profiles: {
    id: string;
    user_id: string;
    courses: string[];
    bio: string | null;
    rate_note: string | null;
    is_active: boolean;
  }[] = [];
  let ownProfile: (typeof profiles)[number] | null = null;
  let requests: {
    id: string;
    tutor_profile_id: string;
    course_code: string | null;
    message: string | null;
    status: string;
    created_at: string;
  }[] = [];

  if (user) {
    const listed = campus
      ? await supabase.from("tutor_profiles").select("*").eq("campus_id", campus.campusId)
      : await supabase.from("tutor_profiles").select("*");
    profiles = listed.data ?? [];

    const own = await supabase.from("tutor_profiles").select("*").eq("user_id", user.id).maybeSingle();
    ownProfile = own.data;

    const req = await supabase
      .from("tutor_requests")
      .select("*")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });
    requests = req.data ?? [];
  }

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Peer tutors" description="Find tutors on your campus or list yourself." />
        <TutorsPanel
          profiles={profiles}
          ownProfile={ownProfile}
          requests={requests}
          campusId={campus?.campusId}
        />
      </div>
    </Container>
  );
}
