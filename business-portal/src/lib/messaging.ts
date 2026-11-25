import type { SupabaseClient } from "@supabase/supabase-js";

export type BizConversation = {
  id: string;
  kind: string;
  subject: string | null;
  updated_at: string;
  lastMessage: string | null;
  unread: boolean;
  businessId: string | null;
};

export function conversationTitle(input: {
  kind: string;
  subject: string | null;
}) {
  if (input.subject) return input.subject;
  if (input.kind === "listing") return "Housing enquiry";
  if (input.kind === "order") return "Order chat";
  return "Chat";
}

export async function loadBusinessConversations(
  supabase: SupabaseClient,
  userId: string,
): Promise<BizConversation[]> {
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select(
      "conversation_id, last_read_at, conversations(id, kind, subject, updated_at, business_id)",
    )
    .eq("user_id", userId);

  const convIds: string[] = [];
  const meta: {
    id: string;
    kind: string;
    subject: string | null;
    updated_at: string;
    last_read_at: string | null;
    businessId: string | null;
  }[] = [];

  for (const part of parts || []) {
    const conv = Array.isArray(part.conversations)
      ? part.conversations[0]
      : part.conversations;
    if (!conv?.id) continue;
    // Business inbox focuses on listing/order (and any chat they're in)
    if (!["listing", "order", "direct", "support"].includes(conv.kind)) continue;
    convIds.push(conv.id);
    meta.push({
      id: conv.id,
      kind: conv.kind,
      subject: conv.subject,
      updated_at: conv.updated_at,
      last_read_at: (part.last_read_at as string | null) || null,
      businessId: (conv.business_id as string | null) || null,
    });
  }

  const { data: recent } = convIds.length
    ? await supabase
        .from("messages")
        .select("conversation_id, body, created_at, message_type")
        .in("conversation_id", convIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : {
        data: [] as {
          conversation_id: string;
          body: string;
          created_at: string;
          message_type: string;
        }[],
      };

  const lastBy = new Map<string, { body: string; created_at: string; message_type: string }>();
  for (const msg of recent || []) {
    if (!lastBy.has(msg.conversation_id)) {
      lastBy.set(msg.conversation_id, {
        body: msg.message_type === "audio" ? "Voice message" : msg.body,
        created_at: msg.created_at,
        message_type: msg.message_type || "text",
      });
    }
  }

  return meta
    .map((c) => {
      const last = lastBy.get(c.id);
      return {
        id: c.id,
        kind: c.kind,
        subject: c.subject,
        updated_at: c.updated_at,
        lastMessage: last?.body || null,
        businessId: c.businessId,
        unread: Boolean(
          last?.created_at &&
            (!c.last_read_at || new Date(last.created_at) > new Date(c.last_read_at)),
        ),
      };
    })
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
}
