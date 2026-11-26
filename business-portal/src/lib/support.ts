export type TicketStatus = "open" | "waiting" | "resolved";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type SupportTicket = {
  id: string;
  number: number;
  conversation_id: string;
  requester_id: string;
  audience: string;
  subject: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  source: "direct" | "assistant";
  summary: string | null;
  assistant_transcript: string | null;
  assigned_to: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  last_message_at: string;
  rating: number | null;
  rating_comment: string | null;
  created_at: string;
};

export type QueueRow = {
  id: string;
  number: number;
  conversation_id: string;
  subject: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  source: "direct" | "assistant";
  audience: string;
  requester_id: string;
  requester_name: string | null;
  requester_email: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  last_message: string | null;
  last_message_at: string;
  first_response_at: string | null;
  created_at: string;
  rating: number | null;
};

export const TICKET_FIELDS =
  "id, number, conversation_id, requester_id, audience, subject, category, priority, status, source, summary, assistant_transcript, assigned_to, first_response_at, resolved_at, last_message_at, rating, rating_comment, created_at";

export const CATEGORY_OPTIONS: { value: string; label: string; business?: boolean; student?: boolean }[] = [
  { value: "account", label: "Login or account" },
  { value: "business_setup", label: "Application or business setup", business: true },
  { value: "listings", label: "Listings, photos or menu", business: true },
  { value: "verification", label: "Verification" },
  { value: "housing", label: "Housing or inspections" },
  { value: "food", label: "Food orders" },
  { value: "marketplace", label: "Marketplace" },
  { value: "payments", label: "Billing, payments or payouts" },
  { value: "classes", label: "Classes or school tools" },
  { value: "technical", label: "Something isn't working" },
  { value: "safety", label: "Safety, scam or abuse" },
  { value: "other", label: "Something else" },
];

export function categoryLabel(value: string) {
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? "Other";
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  waiting: "Waiting on user",
  resolved: "Resolved",
};

/** What the person who asked sees. */
export const REQUESTER_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "With support",
  waiting: "Support replied",
  resolved: "Resolved",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function statusClass(status: TicketStatus) {
  if (status === "resolved") return "bg-success/15 text-success";
  if (status === "waiting") return "bg-soft text-muted";
  return "bg-accent-soft text-fg";
}

export function priorityClass(priority: TicketPriority) {
  if (priority === "urgent") return "bg-danger text-white";
  if (priority === "high") return "bg-danger/15 text-danger";
  return "bg-soft text-muted";
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
