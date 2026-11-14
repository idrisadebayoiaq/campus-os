import { GroupsPanel } from "@/components/study/groups-panel";
import { Container, PageHeader } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Study groups" };
export const instant = false;

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const campus = user ? await getStudentCampus(supabase, user.id) : null;

  let groups: { id: string; title: string; course_code: string; description: string | null }[] = [];
  let memberships: string[] = [];
  let posts: { id: string; group_id: string; body: string; created_at: string }[] = [];

  if (user) {
    const q = campus
      ? await supabase.from("study_groups").select("*").eq("campus_id", campus.campusId)
      : await supabase.from("study_groups").select("*");
    groups = q.data ?? [];

    const mem = await supabase.from("study_group_members").select("group_id").eq("user_id", user.id);
    memberships = (mem.data ?? []).map((m) => m.group_id);

    if (memberships.length) {
      const p = await supabase
        .from("study_group_posts")
        .select("*")
        .in("group_id", memberships)
        .order("created_at", { ascending: false });
      posts = p.data ?? [];
    }
  }

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Study groups" description="Join course groups and share tips with peers." />
        <GroupsPanel
          groups={groups}
          memberships={memberships}
          posts={posts}
          campusId={campus?.campusId}
        />
      </div>
    </Container>
  );
}
