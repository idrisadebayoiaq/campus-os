import type { SupabaseClient } from "@supabase/supabase-js";

export type TicketStatus = "open" | "waiting" | "resolved";

export type SupportTicketInfo = {
  id: string;
  number: number;
  status: TicketStatus;
  rating: number | null;
};

export type SupportTicketRow = SupportTicketInfo & {
  conversation_id: string;
  subject: string;
  source: "direct" | "assistant";
  last_message_at: string;
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "With support",
  waiting: "Support replied",
  resolved: "Resolved",
};

export type AssistantMessage = {
  id: string;
  body: string;
  sender_id: string | null;
  message_type: string;
  created_at: string;
};

export type AssistantResult = {
  conversationId?: string;
  messages?: AssistantMessage[];
  ticket?: { id: string; number: number; conversation_id: string } | null;
  error?: string;
};

export const STUDENT_TOPICS: { category: string; title: string; icon: string }[] = [
  { category: "housing", title: "Housing or an agent", icon: "business-outline" },
  { category: "food", title: "Food or marketplace order", icon: "bag-handle-outline" },
  { category: "account", title: "Login or account", icon: "key-outline" },
  { category: "verification", title: "Student ID verification", icon: "shield-checkmark-outline" },
  { category: "safety", title: "Safety, scam or abuse", icon: "warning-outline" },
  { category: "technical", title: "Something isn't working", icon: "bug-outline" },
  { category: "other", title: "Something else", icon: "help-circle-outline" },
];

export async function loadMyTickets(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("support_tickets")
    .select("id, number, status, rating, conversation_id, subject, source, last_message_at")
    .eq("requester_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(30);
  return (data ?? []) as SupportTicketRow[];
}

export async function openTicket(
  supabase: SupabaseClient,
  input: { subject: string; message: string; category: string },
) {
  const { data, error } = await supabase.rpc("open_support_ticket", {
    p_subject: input.subject,
    p_message: input.message,
    p_category: input.category,
  });
  if (error || !data) throw error ?? new Error("Could not create your ticket");
  return data as SupportTicketRow;
}

export async function callAssistant(
  supabase: SupabaseClient,
  body: { action: "open" | "send" | "handoff"; message?: string },
): Promise<AssistantResult> {
  const { data, error } = await supabase.functions.invoke("support-assistant", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as AssistantResult;
        if (parsed?.error) return { error: parsed.error };
      } catch {
        // fall through
      }
    }
    return { error: "The assistant is unavailable right now. Try Chat with support." };
  }
  return data as AssistantResult;
}
