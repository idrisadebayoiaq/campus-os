import Link from "next/link";
import { redirect } from "next/navigation";
import { ArticleEditor, SavedReplyManager, type Article } from "@/components/support-desk";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/support";

export const metadata = { title: "Assistant knowledge · Support desk" };
export const instant = false;

const TABS = [
  { key: "answers", label: "Answers" },
  { key: "unanswered", label: "Couldn't answer" },
  { key: "replies", label: "Saved replies" },
] as const;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab: rawTab, q } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? (rawTab as string) : "answers";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support-desk/knowledge");

  const [{ data: articles }, { data: runs }, { data: replies }, { data: statRows }] = await Promise.all([
    supabase
      .from("support_articles")
      .select("id, title, body, audience, category, keywords, published, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("support_ai_runs")
      .select("id, question, created_at, ticket_id, mode")
      .eq("handed_off", true)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("support_saved_replies").select("id, title, body").order("title"),
    supabase.rpc("support_stats", { p_days: 30 }),
  ]);

  const stats = (statRows?.[0] ?? {}) as { assistant_chats?: number; assistant_handoffs?: number };
  const chats = stats.assistant_chats ?? 0;
  const handoffs = stats.assistant_handoffs ?? 0;
  const list = ((articles ?? []) as Article[]).filter(
    (a) => !q || `${a.title} ${a.body} ${a.keywords ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Container className="max-w-5xl space-y-6 py-6 sm:py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Assistant knowledge</h1>
        <p className="max-w-2xl text-sm text-muted">
          The CampusOS Assistant answers from these answers. Add one whenever the team explains the
          same thing twice, and check what it couldn&apos;t answer.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "Published answers", value: (articles ?? []).filter((a) => a.published).length },
          { label: "Assistant chats (30 days)", value: chats },
          { label: "Passed to a person", value: chats ? `${Math.round((handoffs / chats) * 100)}%` : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-surface px-4 py-4">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <nav className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/support-desk/knowledge?tab=${t.key}`}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
              t.key === tab ? "bg-fg text-bg" : "bg-surface text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "answers" ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form action="/support-desk/knowledge" className="flex-1">
              <input type="hidden" name="tab" value="answers" />
              <input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search answers"
                className="h-10 w-full rounded-full px-4 text-sm sm:max-w-sm"
              />
            </form>
            <ArticleEditor />
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {list.length ? (
              list.map((a) => <ArticleEditor key={a.id} article={a} />)
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted">No answers match.</p>
            )}
          </div>
        </section>
      ) : null}

      {tab === "unanswered" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            Questions the assistant passed to a person. If one keeps coming up, add an answer for it.
          </p>
          {runs?.length ? (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {runs.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm">{r.question}</p>
                    <p className="text-xs text-muted">{timeAgo(r.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs font-medium">
                    {r.ticket_id ? (
                      <Link href={`/support-desk/${r.ticket_id}`} className="text-muted hover:text-fg">
                        View ticket
                      </Link>
                    ) : null}
                    <Link
                      href={`/support-desk/knowledge?tab=answers&q=${encodeURIComponent(r.question.slice(0, 40))}`}
                      className="text-accent hover:underline"
                    >
                      Find or add answer
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
              Nothing yet — the assistant hasn&apos;t had to pass any questions on.
            </p>
          )}
        </section>
      ) : null}

      {tab === "replies" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            Ready-made replies the team can insert into a ticket chat with one click.
          </p>
          <SavedReplyManager replies={(replies ?? []) as { id: string; title: string; body: string }[]} />
        </section>
      ) : null}
    </Container>
  );
}
