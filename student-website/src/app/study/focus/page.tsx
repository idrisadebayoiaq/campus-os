import { FocusTimer } from "@/components/study/focus-timer";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Focus timer" };
export const instant = false;

export default async function FocusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessions } = user
    ? await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Focus timer" description="Pomodoro focus sessions." />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>
        <FocusTimer />
        <div className="divide-y divide-border rounded-md border border-border">
          {(sessions ?? []).length ? (
            sessions!.map((s) => (
              <div key={s.id} className="px-4 py-3 text-sm">
                {s.minutes} min · {s.kind} · {new Date(s.created_at).toLocaleString()}
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted">Complete a focus block to log time here.</p>
          )}
        </div>
      </div>
    </Container>
  );
}
