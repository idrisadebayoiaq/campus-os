import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/support-desk";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  categoryLabel,
  priorityClass,
  statusClass,
  timeAgo,
  type QueueRow,
} from "@/lib/support";

export const metadata = { title: "Support desk" };
export const instant = false;

const VIEWS = [
  { key: "open", label: "Needs reply" },
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "Mine" },
  { key: "waiting", label: "Waiting on user" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

export default async function SupportDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { view: rawView, q } = await searchParams;
  const view = VIEWS.some((v) => v.key === rawView) ? (rawView as string) : "open";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support-desk");

  const [{ data: rows, error }, { data: countRows }, { data: statRows }, { data: profile }] = await Promise.all([
    supabase.rpc("support_queue", { p_view: view, p_search: q ?? null }),
    supabase.rpc("support_queue_counts"),
    supabase.rpc("support_stats", { p_days: 7 }),
    supabase.from("profiles").select("preferred_name, first_name, full_name").eq("id", user.id).maybeSingle(),
  ]);

  if (error) {
    return (
      <Container className="py-12">
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          The Support desk is for the CampusOS support team. Ask an admin to add you.
        </p>
      </Container>
    );
  }

  const tickets = (rows ?? []) as QueueRow[];
  const counts = (countRows?.[0] ?? {}) as {
    open_count?: number;
    unassigned_count?: number;
    mine_count?: number;
    waiting_count?: number;
  };
  const stats = (statRows?.[0] ?? {}) as {
    tickets?: number;
    resolved?: number;
    assistant_chats?: number;
    assistant_handoffs?: number;
    median_first_reply_minutes?: number | null;
    avg_rating?: number | null;
  };
  const countFor: Record<string, number | undefined> = {
    open: counts.open_count,
    unassigned: counts.unassigned_count,
    mine: counts.mine_count,
    waiting: counts.waiting_count,
  };
  const name = profile?.preferred_name || profile?.first_name || profile?.full_name || "there";
  const solvedByAssistant =
    stats.assistant_chats && stats.assistant_chats > 0
      ? Math.round(((stats.assistant_chats - (stats.assistant_handoffs ?? 0)) / stats.assistant_chats) * 100)
      : null;
  const firstReply = stats.median_first_reply_minutes;

  return (
    <Container className="max-w-6xl space-y-6 py-6 sm:py-10">
      <LiveRefresh channel="support-desk-queue" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">Hi {name.split(" ")[0]}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Support desk</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Need a reply", value: counts.open_count ?? 0 },
          { label: "Assigned to you", value: counts.mine_count ?? 0 },
          {
            label: "First reply (median, 7 days)",
            value: firstReply == null ? "—" : firstReply < 60 ? `${firstReply}m` : `${Math.round(firstReply / 60)}h`,
          },
          {
            label: "Solved by the assistant",
            value: solvedByAssistant == null ? "—" : `${solvedByAssistant}%`,
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-surface px-4 py-4">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {VIEWS.map((v) => {
            const active = v.key === view;
            const count = countFor[v.key];
            return (
              <Link
                key={v.key}
                href={`/support-desk?view=${v.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                  active ? "bg-fg text-bg" : "bg-surface text-muted hover:text-fg"
                }`}
              >
                {v.label}
                {count ? (
                  <span
                    className={`rounded-full px-1.5 text-[11px] font-semibold ${
                      active ? "bg-bg/20" : "bg-accent-soft text-fg"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <form action="/support-desk" className="flex gap-2">
          <input type="hidden" name="view" value={view} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search #number, subject or email"
            className="h-10 w-full rounded-full px-4 text-sm lg:w-72"
          />
        </form>
      </div>

      {tickets.length ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="hidden grid-cols-[5rem_minmax(0,1fr)_10rem_8rem_7rem] gap-3 border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
            <span>Ticket</span>
            <span>Request</span>
            <span>From</span>
            <span>Assignee</span>
            <span className="text-right">Updated</span>
          </div>
          <div className="divide-y divide-border">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/support-desk/${t.id}`}
                className="grid gap-2 px-4 py-3 hover:bg-surface md:grid-cols-[5rem_minmax(0,1fr)_10rem_8rem_7rem] md:items-center md:gap-3"
              >
                <span className="text-sm font-semibold text-muted">#{t.number}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{t.subject}</span>
                    {t.priority === "high" || t.priority === "urgent" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityClass(t.priority)}`}>
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                    ) : null}
                    {t.source === "assistant" ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold">From AI</span>
                    ) : null}
                    {view === "all" || view === "mine" || view === "unassigned" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(t.status)}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {categoryLabel(t.category)} · {t.last_message || "No messages"}
                  </span>
                </span>
                <span className="min-w-0 text-xs">
                  <span className="block truncate font-medium">{t.requester_name}</span>
                  <span className="block truncate capitalize text-muted">{t.audience}</span>
                </span>
                <span className="truncate text-xs text-muted">{t.assignee_name || "Unassigned"}</span>
                <span className="text-xs text-muted md:text-right">{timeAgo(t.last_message_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-medium">Nothing here</p>
          <p className="mt-1 text-sm text-muted">
            {view === "open" ? "Every ticket has a reply. Nice work." : "No tickets match this view."}
          </p>
        </div>
      )}
    </Container>
  );
}
