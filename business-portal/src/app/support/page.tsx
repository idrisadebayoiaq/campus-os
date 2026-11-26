import Link from "next/link";
import { redirect } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import {
  REQUESTER_STATUS_LABEL,
  statusClass,
  timeAgo,
  type SupportTicket,
} from "@/lib/support";

export const metadata = { title: "Help & support" };
export const instant = false;

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support");

  const [{ data: tickets }, { data: articles }] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, number, subject, status, last_message_at, source")
      .eq("requester_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(30),
    supabase
      .from("support_articles")
      .select("id, title, body")
      .eq("published", true)
      .in("audience", ["all", "business"])
      .order("created_at", { ascending: true })
      .limit(8),
  ]);

  const list = (tickets ?? []) as Pick<
    SupportTicket,
    "id" | "number" | "subject" | "status" | "last_message_at" | "source"
  >[];
  const openCount = list.filter((t) => t.status !== "resolved").length;

  return (
    <Container className="space-y-8 py-8 sm:py-12">
      <section className="rounded-3xl bg-hero-bg p-6 text-hero-fg sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-hero-muted">Help & support</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">How can we help?</h1>
        <p className="mt-2 max-w-xl text-sm text-hero-muted">
          Get an instant answer from the CampusOS Assistant, or go straight to a person on the
          support team.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/support/assistant"
          className="group flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 transition hover:border-accent"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-on-accent">
              AI
            </span>
            <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
              Instant · 24/7
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Chat live</h2>
            <p className="mt-1 text-sm text-muted">
              The CampusOS Assistant answers right away using our help guides and your account
              status. If it can&apos;t help, it creates a ticket and passes you to the team.
            </p>
          </div>
          <span className="mt-auto text-sm font-semibold text-accent group-hover:underline">
            Start chat →
          </span>
        </Link>

        <Link
          href="/support/new"
          className="group flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 transition hover:border-accent"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
              <NavIcon name="support" className="h-6 w-6" />
            </span>
            <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold text-muted">
              A person replies
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Chat with support</h2>
            <p className="mt-1 text-sm text-muted">
              Open a ticket with the CampusOS support team. Best for payments, disputes, account
              access or anything urgent. You&apos;ll get a notification when we reply.
            </p>
          </div>
          <span className="mt-auto text-sm font-semibold text-accent group-hover:underline">
            Open a ticket →
          </span>
        </Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Your tickets</h2>
          {openCount ? <p className="text-xs text-muted">{openCount} open</p> : null}
        </div>
        {list.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {list.map((t) => (
              <Link
                key={t.id}
                href={`/support/tickets/${t.id}`}
                className="flex flex-col gap-2 px-4 py-3 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="text-muted">#{t.number}</span> {t.subject}
                  </p>
                  <p className="text-xs text-muted">
                    {t.source === "assistant" ? "From the assistant · " : ""}
                    Updated {timeAgo(t.last_message_at)}
                  </p>
                </div>
                <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClass(t.status)}`}>
                  {REQUESTER_STATUS_LABEL[t.status]}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No tickets yet. Anything you send to the support team shows up here.
          </p>
        )}
      </section>

      {articles?.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Quick answers</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {articles.map((a) => (
              <details key={a.id} className="group rounded-2xl border border-border bg-surface px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-medium">
                  <span className="flex items-center justify-between gap-3">
                    {a.title}
                    <span className="text-muted transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-center text-xs text-muted">
        You can also email{" "}
        <a href="mailto:support@campusos.app" className="underline underline-offset-2">
          support@campusos.app
        </a>
      </p>
    </Container>
  );
}
