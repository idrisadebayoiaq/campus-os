import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureSupportConversation(supabase: SupabaseClient, userId: string) {
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);

  const ids = (parts || []).map((p) => p.conversation_id);
  if (ids.length) {
    const { data: support } = await supabase
      .from("conversations")
      .select("id")
      .in("id", ids)
      .eq("kind", "support")
      .limit(1)
      .maybeSingle();
    if (support?.id) return support.id as string;
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      kind: "support",
      subject: "CampusOS Support",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !conversation) throw error || new Error("Could not create support chat");

  await supabase.from("conversation_participants").insert({
    conversation_id: conversation.id,
    user_id: userId,
    last_read_at: new Date().toISOString(),
  });

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: null,
    body: "Welcome to CampusOS Inbox. Message businesses, housing agents, and CampusOS support here — same flow as WhatsApp: pick a chat, type, send.",
  });

  return conversation.id as string;
}

export function conversationTitle(input: {
  kind: string;
  subject: string | null;
  peerName?: string | null;
}) {
  if (input.subject) return input.subject;
  if (input.kind === "support") return "CampusOS Support";
  if (input.peerName) return input.peerName;
  return "Chat";
}
