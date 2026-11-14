import { CbtPanel } from "@/components/study/cbt-panel";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mock CBT" };
export const instant = false;

export default async function CbtPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: savedQuestions } = user
    ? await supabase
        .from("quiz_questions")
        .select("id, prompt, options, correct_index, explanation, topic")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  const { data: attempts } = user
    ? await supabase
        .from("cbt_attempts")
        .select("id, correct, total, duration_seconds, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  const normalized = (savedQuestions ?? []).map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? (q.options as string[]) : [],
  }));

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Mock CBT" description="Timed MCQs from saved or AI-generated questions." />
        <CbtPanel savedQuestions={normalized} attempts={attempts ?? []} />
      </div>
    </Container>
  );
}
