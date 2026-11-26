import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SaveAsAnswer, TicketControls, TicketNotes } from "@/components/support-desk";
import { SupportThread } from "@/components/support-thread";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_FIELDS,
  categoryLabel,
  priorityClass,
  statusClass,
  timeAgo,
  type SupportTicket,
} from "@/lib/support";

export const metadata = { title: "Ticket · Support desk" };
export const instant = false;

export default async function DeskTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/support-desk/${id}`);

  const { data } = await supabase.from("support_tickets").select(TICKET_FIELDS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const ticket = data as SupportTicket;

  const [{ data: requesterRows }, { data: agents }, { data: notes }, { data: replies }, { data: lastAgentMsg }] =
    await Promise.all([
      supabase.rpc("support_requester", { p_ticket: id }),
      supabase.rpc("support_agents"),
      supabase
        .from("support_ticket_notes")
        .select("id, body, created_at, author_id")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
      supabase.from("support_saved_replies").select("id, title, body").order("title"),
      supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", ticket.conversation_id)
        .eq("message_type", "text")
        .neq("sender_id", ticket.requester_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const requester = (requesterRows?.[0] ?? null) as {
    name: string;
    email: string;
    roles: string[];
    joined_at: string;
    location: string | null;
    business_names: string[];
    ticket_count: number;
  } | null;
  const agentList = (agents ?? []) as { user_id: string; name: string; email: string }[];
  const nameById = new Map(agentList.map((a) => [a.user_id, a.name]));
  const noteList = (notes ?? []).map((n) => ({
    id: n.id as string,
    body: n.body as string,
    created_at: n.created_at as string,
    author_name: nameById.get(n.author_id as string) ?? "Support",
  }));

  return (
    <Container className="max-w-6xl space-y-5 py-6 sm:py-8">
      <div className="space-y-2">
        <Link href="/support-desk" className="text-sm text-muted hover:text-fg">
          ← All tickets
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              <span className="text-muted">#{ticket.number}</span> {ticket.subject}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {categoryLabel(ticket.category)} · opened {timeAgo(ticket.created_at)}
              {ticket.source === "assistant" ? " · passed on by the assistant" : ""}
              {ticket.first_response_at ? ` · first reply ${timeAgo(ticket.first_response_at)}` : " · no reply yet"}
            </p>
          </div>
          <div className="flex gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(ticket.priority)}`}>
              {PRIORITY_LABEL[ticket.priority]}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}>
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {ticket.summary || ticket.assistant_transcript ? (
            <div className="space-y-2 rounded-2xl border border-accent/30 bg-accent-soft/50 p-4 text-sm">
              {ticket.summary ? (
                <p>
                  <span className="font-semibold">Summary: </span>
                  {ticket.summary}
                </p>
              ) : null}
              {ticket.assistant_transcript ? (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-muted">
                    Chat with the assistant before hand-off
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-bg p-3 font-sans text-xs text-muted">
                    {ticket.assistant_transcript}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}

          <SupportThread
            conversationId={ticket.conversation_id}
            userId={user.id}
            asAgent
            requesterName={requester?.name}
            savedReplies={(replies ?? []) as { id: string; title: string; body: string }[]}
          />

          <SaveAsAnswer
            ticketId={ticket.id}
            defaultTitle={ticket.subject}
            defaultBody={(lastAgentMsg?.body as string | undefined) ?? ""}
          />
        </div>

        <aside className="space-y-4">
          {requester ? (
            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
              <div>
                <p className="font-semibold">{requester.name}</p>
                <a href={`mailto:${requester.email}`} className="break-all text-xs text-muted underline-offset-2 hover:underline">
                  {requester.email}
                </a>
              </div>
              <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-y-1.5 text-xs">
                <dt className="text-muted">Account</dt>
                <dd className="capitalize">{ticket.audience}</dd>
                <dt className="text-muted">Roles</dt>
                <dd>{requester.roles.length ? requester.roles.join(", ").replace(/_/g, " ") : "—"}</dd>
                {requester.business_names.length ? (
                  <>
                    <dt className="text-muted">Business</dt>
                    <dd>{requester.business_names.join(", ")}</dd>
                  </>
                ) : null}
                {requester.location ? (
                  <>
                    <dt className="text-muted">Location</dt>
                    <dd>{requester.location}</dd>
                  </>
                ) : null}
                <dt className="text-muted">Joined</dt>
                <dd>{new Date(requester.joined_at).toLocaleDateString()}</dd>
                <dt className="text-muted">Tickets</dt>
                <dd>{requester.ticket_count}</dd>
              </dl>
            </div>
          ) : null}

          <TicketControls
            ticketId={ticket.id}
            status={ticket.status}
            priority={ticket.priority}
            category={ticket.category}
            assignedTo={ticket.assigned_to}
            agents={agentList}
            currentUserId={user.id}
          />

          <TicketNotes ticketId={ticket.id} userId={user.id} notes={noteList} />

          {ticket.rating ? (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="font-semibold">Rating: {"★".repeat(ticket.rating)}{"☆".repeat(5 - ticket.rating)}</p>
              {ticket.rating_comment ? <p className="mt-1 text-muted">“{ticket.rating_comment}”</p> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </Container>
  );
}
