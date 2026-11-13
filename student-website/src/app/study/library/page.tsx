import { LibraryPanel } from "@/components/study/library-panel";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Study library" };
export const instant = false;

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: items } = user
    ? await supabase
        .from("study_library_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: courses } = user
    ? await supabase.from("student_courses").select("id, code").eq("user_id", user.id)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Notes library" description="Your notes." />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>
        <LibraryPanel items={items ?? []} courses={courses ?? []} />
      </div>
    </Container>
  );
}
