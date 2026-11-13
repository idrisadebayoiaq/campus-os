import { FlashcardsPanel } from "@/components/study/flashcards-panel";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Flashcards" };
export const instant = false;

export default async function FlashcardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: decks }, { data: cards }, { data: courses }] = user
    ? await Promise.all([
        supabase.from("flashcard_decks").select("*").eq("user_id", user.id),
        supabase.from("flashcards").select("*").eq("user_id", user.id),
        supabase.from("student_courses").select("id, code").eq("user_id", user.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Flashcards" description="Review decks." />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>
        <FlashcardsPanel decks={decks ?? []} cards={cards ?? []} courses={courses ?? []} />
      </div>
    </Container>
  );
}
