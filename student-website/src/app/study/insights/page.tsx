import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Study insights" };
export const instant = false;

export default async function StudyInsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState title="Log in" description="Log in to continue." />
        </div>
      </Container>
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [{ data: sessions }, { data: attempts }, usageRes] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("minutes, created_at, kind")
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString()),
    supabase
      .from("cbt_attempts")
      .select("id, total, correct, course_code, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", dayStart.toISOString()),
  ]);

  const weekMinutes = (sessions ?? []).reduce((sum, s) => sum + Number(s.minutes || 0), 0);
  const sessionCount = sessions?.length ?? 0;
  const aiToday = usageRes.count ?? 0;

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title="Study insights"
          description="Focus time, mock CBT scores, and AI usage at a glance."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Focus minutes (7d)" value={String(weekMinutes)} />
          <Stat label="Sessions (7d)" value={String(sessionCount)} />
          <Stat label="AI uses today" value={String(aiToday)} />
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Recent CBT</h2>
          {!attempts?.length ? (
            <p className="text-sm text-muted">No mock exams yet. Try Mock CBT.</p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {attempts.map((a) => (
                <div key={a.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">
                    {a.course_code || "General"} · {a.correct}/{a.total}
                  </p>
                  <p className="text-muted">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </Container>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
