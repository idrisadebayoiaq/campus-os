import { PastQuestionsPanel } from "@/components/study/past-questions-panel";
import { Container, PageHeader } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Past questions" };
export const instant = false;

export default async function PastQuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const campus = user ? await getStudentCampus(supabase, user.id) : null;

  type Doc = {
    id: string;
    title: string;
    course_code: string;
    session_label: string | null;
    content: string | null;
    is_public_to_campus: boolean;
  };

  let docs: Doc[] = [];
  if (user) {
    const own = await supabase
      .from("past_question_docs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const campusDocs = campus
      ? await supabase
          .from("past_question_docs")
          .select("*")
          .eq("campus_id", campus.campusId)
          .eq("is_public_to_campus", true)
      : { data: [] };

    const merged = [...(own.data ?? []), ...(campusDocs.data ?? [])];
    const seen = new Set<string>();
    docs = merged.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    }) as Doc[];
  }

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Past questions" description="Store and browse past papers by course." />
        <PastQuestionsPanel docs={docs} campusId={campus?.campusId} />
      </div>
    </Container>
  );
}
