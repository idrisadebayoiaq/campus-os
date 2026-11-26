import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TicketRating } from "@/components/support-forms";
import { SupportThread } from "@/components/support-thread";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import {
  REQUESTER_STATUS_LABEL,
  TICKET_FIELDS,
  categoryLabel,
  statusClass,
  type SupportTicket,
} from "@/lib/support";

export const metadata = { title: "Support ticket" };
export const instant = false;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/support/tickets/${id}`);

  const { data } = await supabase
    .from("support_tickets")
    .select(TICKET_FIELDS)
    .eq("id", id)
    .eq("requester_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  const ticket = data as SupportTicket;

  return (
    <Container className="space-y-5 py-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/support" className="text-sm text-muted hover:text-fg">
            ← Help & support
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="text-muted">#{ticket.number}</span> {ticket.subject}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {categoryLabel(ticket.category)} · opened {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}>
          {REQUESTER_STATUS_LABEL[ticket.status]}
        </span>
      </div>

      {ticket.status === "resolved" ? (
        <TicketRating ticketId={ticket.id} rating={ticket.rating} comment={ticket.rating_comment} />
      ) : null}

      <SupportThread
        conversationId={ticket.conversation_id}
        userId={user.id}
        resolved={ticket.status === "resolved"}
      />
    </Container>
  );
}
