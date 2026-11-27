import type { SupabaseClient } from "@supabase/supabase-js";
import { stripMarkdown } from "@/src/lib/markdown";

export type ConversationKind =
  | "direct"
  | "support"
  | "listing"
  | "order"
  | "group"
  | "ai"
  | "assistant";

export type MessageType = "text" | "audio" | "system" | "image";

export type ConversationListItem = {
  id: string;
  kind: ConversationKind | string;
  subject: string | null;
  updated_at: string;
  lastMessage: string | null;
  lastMessageType: MessageType | string;
  unread: boolean;
  unreadCount?: number;
  lastFromMe?: boolean;
  lastAt?: string | null;
  muted: boolean;
  businessId?: string | null;
  /** The other person in a one-to-one chat, or the business name. */
  peerName?: string | null;
  peerAvatar?: string | null;
};

export type ChatPerson = { id: string; name: string; avatarUrl: string | null; role: string };

const GENERIC_SUBJECT = /^(chat|group|group chat)$/i;

export type ChatMessage = {
  id: string;
  conversation_id: string;
  body: string;
  sender_id: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  message_type?: MessageType | string | null;
  media_url?: string | null;
  media_duration_ms?: number | null;
  client_id?: string | null;
};

export type AiCompanionProfile = {
  id: string;
  user_id: string;
  conversation_id: string;
  display_name: string;
  avatar_url: string | null;
  reply_mode: "text_only" | "voice_only";
  explanation_style: "simple" | "balanced" | "detailed";
  personality: "friendly" | "strict_tutor" | "concise";
  language: string;
  use_course_context: boolean;
  save_history: boolean;
  voice_id: string | null;
  speech_rate: number;
  system_notes: string | null;
};

export const INBOX_FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "direct", label: "Personal" },
  { key: "group", label: "Groups" },
  { key: "listing", label: "Housing" },
  { key: "order", label: "Business" },
] as const;

/** AI tutor and support have their own screens and never appear in Chats. */
export const STANDALONE_KINDS = new Set(["ai", "support", "assistant"]);

export function conversationTitle(input: {
  kind: string;
  subject: string | null;
  peerName?: string | null;
}) {
  const generic = !input.subject || GENERIC_SUBJECT.test(input.subject.trim());
  if (input.kind === "ai") return input.subject || input.peerName || "CampusOS Tutor";
  if (input.kind === "direct") return input.peerName || (!generic ? input.subject : null) || "Chat";
  if (input.kind === "group") return (!generic && input.subject) || "Group chat";
  if (input.kind === "support") return (!generic && input.subject) || "CampusOS Support";
  if (!generic && input.subject) return input.subject!;
  if (input.peerName) return input.peerName;
  if (input.kind === "listing") return "Housing chat";
  if (input.kind === "order") return "Business chat";
  return "Chat";
}

export function kindLabel(kind: string) {
  switch (kind) {
    case "ai":
      return "AI";
    case "group":
      return "Group";
    case "listing":
      return "Housing agent";
    case "order":
      return "Business";
    case "support":
      return "Support";
    case "direct":
      return "Personal";
    default:
      return "Chat";
  }
}

export function previewForMessage(msg: {
  body?: string | null;
  message_type?: string | null;
} | null) {
  if (!msg) return null;
  if (msg.message_type === "audio") return "Voice message";
  if (msg.message_type === "image") return "Photo";
  if (msg.message_type === "system") return msg.body || "Update";
  if (msg.message_type === "assistant" && msg.body) return stripMarkdown(msg.body).replace(/\s*\n+\s*/g, " ");
  return msg.body || null;
}

export async function ensureAiConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ conversationId: string; profile: AiCompanionProfile }> {
  const loadExisting = async () => {
    const { data } = await supabase
      .from("ai_companion_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data as AiCompanionProfile | null;
  };

  const existing = await loadExisting();
  if (existing?.conversation_id) {
    return {
      conversationId: existing.conversation_id,
      profile: existing,
    };
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      kind: "ai",
      subject: "CampusOS Tutor",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !conversation) {
    // Race: another client may have created the profile first
    const raced = await loadExisting();
    if (raced?.conversation_id) {
      return { conversationId: raced.conversation_id, profile: raced };
    }
    throw error || new Error("Could not create AI chat");
  }

  const { error: partError } = await supabase
    .from("conversation_participants")
    .insert({
      conversation_id: conversation.id,
      user_id: userId,
      role: "member",
      last_read_at: new Date().toISOString(),
    });
  if (partError && partError.code !== "23505") {
    throw partError;
  }

  let profile: AiCompanionProfile | null = null;
  if (existing) {
    const { data, error: updError } = await supabase
      .from("ai_companion_profiles")
      .update({ conversation_id: conversation.id })
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updError) throw updError;
    profile = data as AiCompanionProfile;
  } else {
    const { data, error: profileError } = await supabase
      .from("ai_companion_profiles")
      .insert({
        user_id: userId,
        conversation_id: conversation.id,
        display_name: "CampusOS Tutor",
        reply_mode: "text_only",
        explanation_style: "balanced",
        personality: "friendly",
      })
      .select("*")
      .single();
    if (profileError) {
      const raced = await loadExisting();
      if (raced?.conversation_id) {
        return { conversationId: raced.conversation_id, profile: raced };
      }
      throw profileError;
    }
    profile = data as AiCompanionProfile;
  }

  if (!profile) {
    throw new Error("Could not create AI profile");
  }

  await supabase
    .from("conversations")
    .update({ subject: profile.display_name })
    .eq("id", conversation.id);

  return {
    conversationId: conversation.id as string,
    profile,
  };
}

type Face = { name: string | null; avatarUrl: string | null; person: ChatPerson | null; members: ChatPerson[] };

/** Names of the other people in chats the signed-in user belongs to. */
export async function loadChatFaces(
  supabase: SupabaseClient,
  userId: string,
  convs: { id: string; kind: string; businessId: string | null }[],
): Promise<Map<string, Face>> {
  const out = new Map<string, Face>();
  if (!convs.length) return out;
  const ids = convs.map((c) => c.id);
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id, role")
    .in("conversation_id", ids);
  const rows = (parts ?? []) as { conversation_id: string; user_id: string; role: string | null }[];
  const peerIds = [...new Set(rows.map((r) => r.user_id).filter((id) => id !== userId))];
  const { data: people } = peerIds.length
    ? await supabase.rpc("chat_people", { p_ids: peerIds })
    : { data: [] as { id: string; display_name: string; avatar_url: string | null }[] };
  const byId = new Map(
    ((people ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map((p) => [p.id, p]),
  );
  const bizIds = [...new Set(convs.map((c) => c.businessId).filter((id): id is string => Boolean(id)))];
  const { data: businesses } = bizIds.length
    ? await supabase.from("business_profiles").select("id, display_name, logo_url").in("id", bizIds)
    : { data: [] as { id: string; display_name: string; logo_url: string | null }[] };
  const bizById = new Map(
    ((businesses ?? []) as { id: string; display_name: string; logo_url: string | null }[]).map((b) => [b.id, b]),
  );

  for (const conv of convs) {
    const others = rows.filter((r) => r.conversation_id === conv.id && r.user_id !== userId);
    const first = others[0];
    const personRow = first ? byId.get(first.user_id) : undefined;
    const person: ChatPerson | null = first
      ? {
          id: first.user_id,
          name: personRow?.display_name || "Student",
          avatarUrl: personRow?.avatar_url ?? null,
          role: first.role || "member",
        }
      : null;
    const biz = conv.businessId ? bizById.get(conv.businessId) : undefined;
    const everyone = rows
      .filter((r) => r.conversation_id === conv.id)
      .map((r) => {
        const row = byId.get(r.user_id);
        return {
          id: r.user_id,
          name: r.user_id === userId ? "You" : row?.display_name || "Student",
          avatarUrl: row?.avatar_url ?? null,
          role: r.role || "member",
        };
      });
    const oneToOne = conv.kind !== "group" && others.length <= 1;
    out.set(conv.id, {
      name: oneToOne ? biz?.display_name || person?.name || null : null,
      avatarUrl: oneToOne ? biz?.logo_url || person?.avatarUrl || null : null,
      person: oneToOne ? person : null,
      members: oneToOne ? [] : everyone,
    });
  }
  return out;
}

export async function loadConversations(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConversationListItem[]> {
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select(
      "conversation_id, last_read_at, muted, archived, cleared_at, conversations(id, kind, subject, updated_at, business_id)",
    )
    .eq("user_id", userId)
    .eq("archived", false);

  const convIds: string[] = [];
  const partMeta: {
    id: string;
    kind: string;
    subject: string | null;
    updated_at: string;
    last_read_at: string | null;
    muted: boolean;
    businessId: string | null;
    clearedAt: string | null;
  }[] = [];

  for (const part of parts || []) {
    const conv = Array.isArray(part.conversations)
      ? part.conversations[0]
      : part.conversations;
    if (!conv?.id || STANDALONE_KINDS.has(conv.kind)) continue;
    convIds.push(conv.id);
    partMeta.push({
      id: conv.id,
      kind: conv.kind,
      subject: conv.subject,
      updated_at: conv.updated_at,
      last_read_at: (part.last_read_at as string | null) || null,
      muted: Boolean(part.muted),
      businessId: (conv.business_id as string | null) || null,
      clearedAt: (part.cleared_at as string | null) || null,
    });
  }

  const { data: recentMessages } = convIds.length
    ? await supabase
        .from("messages")
        .select("conversation_id, body, created_at, message_type, sender_id")
        .in("conversation_id", convIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1500)
    : {
        data: [] as {
          conversation_id: string;
          body: string;
          created_at: string;
          message_type: string;
          sender_id: string | null;
        }[],
      };

  const lastByConv = new Map<
    string,
    { body: string; created_at: string; message_type: string; sender_id: string | null }
  >();
  const unreadBy = new Map<string, number>();
  const clearedBy = new Map(partMeta.map((c) => [c.id, c.clearedAt]));
  const readBy = new Map(partMeta.map((c) => [c.id, c.last_read_at]));
  for (const msg of recentMessages || []) {
    const clearedAt = clearedBy.get(msg.conversation_id);
    if (clearedAt && new Date(msg.created_at) <= new Date(clearedAt)) continue;
    if (!lastByConv.has(msg.conversation_id)) {
      lastByConv.set(msg.conversation_id, {
        body: msg.body,
        created_at: msg.created_at,
        message_type: msg.message_type || "text",
        sender_id: msg.sender_id ?? null,
      });
    }
    const readAt = readBy.get(msg.conversation_id);
    if (msg.sender_id !== userId && msg.message_type !== "system" && (!readAt || new Date(msg.created_at) > new Date(readAt))) {
      unreadBy.set(msg.conversation_id, (unreadBy.get(msg.conversation_id) ?? 0) + 1);
    }
  }

  const faces = await loadChatFaces(
    supabase,
    userId,
    partMeta.map((c) => ({ id: c.id, kind: c.kind, businessId: c.businessId })),
  );

  const rows: ConversationListItem[] = partMeta.map((c) => {
    const last = lastByConv.get(c.id);
    const face = faces.get(c.id);
    return {
      id: c.id,
      kind: c.kind,
      subject: c.subject,
      peerName: face?.name ?? null,
      peerAvatar: face?.avatarUrl ?? null,
      updated_at: c.updated_at,
      lastMessage: previewForMessage(last ?? null),
      lastMessageType: last?.message_type || "text",
      muted: c.muted,
      businessId: c.businessId,
      unread: Boolean(
        last?.created_at &&
          (!c.last_read_at ||
            new Date(last.created_at) > new Date(c.last_read_at)),
      ),
      unreadCount: unreadBy.get(c.id) ?? 0,
      lastFromMe: last?.sender_id === userId,
      lastAt: last?.created_at ?? null,
    };
  });

  rows.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  return rows;
}

/** Delete one message (yours, or any message in your AI tutor chat). */
export async function deleteMessage(supabase: SupabaseClient, messageId: string) {
  const { error } = await supabase.rpc("delete_message", { p_message: messageId });
  if (error) throw error;
}

/** Clear the chat history for you. The chat stays in your list. */
export async function clearConversation(supabase: SupabaseClient, conversationId: string) {
  const { error } = await supabase.rpc("clear_conversation", { p_conversation: conversationId });
  if (error) throw error;
}

/** Remove the chat from your list (it returns if someone writes again). */
export async function deleteConversation(supabase: SupabaseClient, conversationId: string) {
  const { error } = await supabase.rpc("delete_conversation", { p_conversation: conversationId });
  if (error) throw error;
}

export async function markConversationRead(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
) {
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

export async function sendTextMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    senderId: string;
    body: string;
    clientId?: string;
  },
) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: input.body,
      message_type: "text",
      client_id: input.clientId || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

/** Create (or reuse) a housing enquiry chat with the listing agent. */
export async function startHousingChat(
  supabase: SupabaseClient,
  input: {
    studentId: string;
    unitId: string;
    businessId: string;
    subject: string;
    message: string;
  },
) {
  const { data: enquiry, error: enquiryError } = await supabase
    .from("listing_enquiries")
    .insert({
      unit_id: input.unitId,
      business_id: input.businessId,
      student_id: input.studentId,
      subject: input.subject,
      message: input.message,
    })
    .select("id")
    .single();
  if (enquiryError) throw enquiryError;

  const { data: biz } = await supabase
    .from("business_profiles")
    .select("owner_user_id, display_name")
    .eq("id", input.businessId)
    .maybeSingle();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      kind: "listing",
      subject: input.subject,
      created_by: input.studentId,
      listing_enquiry_id: enquiry?.id ?? null,
      business_id: input.businessId,
    })
    .select("id")
    .single();
  if (convError || !conversation) {
    throw convError || new Error("Could not create chat");
  }

  const participants: {
    conversation_id: string;
    user_id: string;
    role: string;
  }[] = [
    {
      conversation_id: conversation.id,
      user_id: input.studentId,
      role: "member",
    },
  ];
  if (biz?.owner_user_id && biz.owner_user_id !== input.studentId) {
    participants.push({
      conversation_id: conversation.id,
      user_id: biz.owner_user_id,
      role: "owner_business",
    });
  }
  await supabase.from("conversation_participants").insert(participants);

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: input.studentId,
    body: input.message,
    message_type: "text",
  });

  return conversation.id as string;
}

export async function startBusinessChat(
  supabase: SupabaseClient,
  input: {
    studentId: string;
    businessId: string;
    subject: string;
    message: string;
    foodOrderId?: string | null;
    listingEnquiryId?: string | null;
  },
) {
  const { data: biz } = await supabase
    .from("business_profiles")
    .select("owner_user_id, display_name")
    .eq("id", input.businessId)
    .maybeSingle();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      kind: "order",
      subject: input.subject || biz?.display_name || "Business chat",
      created_by: input.studentId,
      business_id: input.businessId,
      food_order_id: input.foodOrderId || null,
      listing_enquiry_id: input.listingEnquiryId || null,
    })
    .select("id")
    .single();
  if (convError || !conversation) {
    throw convError || new Error("Could not create business chat");
  }

  const participants: {
    conversation_id: string;
    user_id: string;
    role: string;
  }[] = [
    {
      conversation_id: conversation.id,
      user_id: input.studentId,
      role: "member",
    },
  ];
  if (biz?.owner_user_id && biz.owner_user_id !== input.studentId) {
    participants.push({
      conversation_id: conversation.id,
      user_id: biz.owner_user_id,
      role: "owner_business",
    });
  }
  await supabase.from("conversation_participants").insert(participants);

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: input.studentId,
    body: input.message,
    message_type: "text",
  });

  return conversation.id as string;
}

export async function createGroupChat(
  supabase: SupabaseClient,
  input: {
    creatorId: string;
    title: string;
    memberIds: string[];
  },
) {
  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      kind: "group",
      subject: input.title.trim() || "Group",
      created_by: input.creatorId,
    })
    .select("id")
    .single();
  if (error || !conversation) throw error || new Error("Could not create group");

  const uniqueMembers = Array.from(
    new Set([input.creatorId, ...input.memberIds]),
  );
  await supabase.from("conversation_participants").insert(
    uniqueMembers.map((uid) => ({
      conversation_id: conversation.id,
      user_id: uid,
      role: uid === input.creatorId ? "admin" : "member",
    })),
  );

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: null,
    message_type: "system",
    body: `Group “${input.title.trim() || "Group"}” created`,
  });

  return conversation.id as string;
}

export async function startDirectChat(
  supabase: SupabaseClient,
  input: { userId: string; peerId: string; firstMessage?: string },
) {
  if (input.userId === input.peerId) {
    throw new Error("Cannot chat with yourself");
  }

  // Find existing 1:1 direct between these two
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversations!inner(id, kind)")
    .eq("user_id", input.userId);

  for (const row of mine || []) {
    const conv = Array.isArray(row.conversations)
      ? row.conversations[0]
      : row.conversations;
    if (!conv || conv.kind !== "direct") continue;
    const { data: peers } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conv.id);
    const ids = (peers || []).map((p) => p.user_id);
    if (
      ids.length === 2 &&
      ids.includes(input.userId) &&
      ids.includes(input.peerId)
    ) {
      return conv.id as string;
    }
  }

  const { data: peerProfile } = await supabase
    .from("profiles")
    .select("preferred_name, first_name, full_name")
    .eq("id", input.peerId)
    .maybeSingle();

  const peerName =
    peerProfile?.preferred_name ||
    peerProfile?.first_name ||
    peerProfile?.full_name ||
    null;

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      kind: "direct",
      subject: peerName,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !conversation) throw error || new Error("Could not start chat");

  await supabase.from("conversation_participants").insert([
    {
      conversation_id: conversation.id,
      user_id: input.userId,
      role: "member",
    },
    {
      conversation_id: conversation.id,
      user_id: input.peerId,
      role: "member",
    },
  ]);

  if (input.firstMessage?.trim()) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: input.userId,
      body: input.firstMessage.trim(),
      message_type: "text",
    });
  }

  return conversation.id as string;
}
