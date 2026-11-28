import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { AppText, Avatar } from "@/src/components/ui";
import {
  AttachmentList,
  LocationCard,
  ReactionChips,
  ReplyQuote,
  type ViewerMedia,
} from "@/src/components/chat/bubble-parts";
import {
  AttachSheet,
  ForwardSheet,
  MediaViewer,
  MessageSheet,
  type AttachChoice,
  type MessageAction,
} from "@/src/components/chat/sheets";
import {
  MediaError,
  copyToChat,
  currentPlace,
  encodeLocation,
  pickDocuments,
  pickFromCamera,
  pickFromLibrary,
  uploadChatFile,
  type Attachment,
  type PickedFile,
} from "@/src/lib/chat-media";
import { AiAvatar } from "@/src/lib/ai-avatars";
import { useAuth } from "@/src/lib/auth";
import { actionSheet, notify } from "@/src/lib/feedback";
import { setOpenConversation } from "@/src/lib/push";
import { useStudyLock } from "@/src/lib/study-lock";
import { formatNaira } from "@/src/lib/campus";
import {
  MESSAGE_COLUMNS,
  clearConversation,
  conversationTitle,
  deleteConversation,
  editMessage,
  hideMessage,
  loadChatFaces,
  loadConversations,
  deleteMessage,
  kindLabel,
  markConversationRead,
  previewForMessage,
  reactToMessage,
  sendMessage,
  sendTextMessage,
  toggleStar,
  type ChatMessage,
  type ConversationListItem,
  type MessageType,
  type Reaction,
} from "@/src/lib/messaging";
import { stripMarkdown } from "@/src/lib/markdown";
import { RichText } from "@/src/components/rich-text";
import { speakText, stopSpeaking } from "@/src/lib/speech";
import { TICKET_STATUS_LABEL, type SupportTicketInfo } from "@/src/lib/support";
import { supabase } from "@/src/lib/supabase";
import { useTheme, useThemeControls } from "@/src/theme/ThemeProvider";

const CHAT = {
  light: { wall: "#F3F0FA", mine: "#DCD3FF", theirs: "#FFFFFF", chip: "#E6E0F7", composer: "#FFFFFF" },
  dark: { wall: "#130E1F", mine: "#4A3D73", theirs: "#2A2140", chip: "#2A2140", composer: "#241C36" },
};
const READ_BLUE = "#3B9EEB";
const NAME_COLORS = ["#7C5CD6", "#D9480F", "#0B7285", "#2B8A3E", "#C2255C", "#1971C2", "#A6730D"];
const GROUP_GAP_MS = 5 * 60 * 1000;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yest.toISOString())) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function nameColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return NAME_COLORS[Math.abs(h) % NAME_COLORS.length];
}

type ThreadSnapshot = {
  kind: string;
  title: string;
  subtitle: string;
  messages: ChatMessage[];
  aiAvatar: string | null;
  peerAvatar: string | null;
};

/** What each chat showed last time, so reopening it draws at once while fresh data loads. */
const threadCache = new Map<string, ThreadSnapshot>();

export default function ChatThreadScreen() {
  const { id, draft: initialDraft, kind: kindHint } = useLocalSearchParams<{
    id: string;
    draft?: string;
    kind?: string;
  }>();
  const cached = id ? threadCache.get(id) : undefined;
  const { user } = useAuth();
  const colors = useTheme();
  const { resolved } = useThemeControls();
  const palette = resolved === "dark" ? CHAT.dark : CHAT.light;
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [title, setTitle] = useState(cached?.title ?? (kindHint === "ai" ? "CampusOS Tutor" : ""));
  const [kind, setKind] = useState(cached?.kind ?? kindHint ?? "direct");
  const [subtitle, setSubtitle] = useState(cached?.subtitle ?? (kindHint === "ai" ? "AI tutor" : ""));
  const [messages, setMessages] = useState<ChatMessage[]>(cached?.messages ?? []);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [loading, setLoading] = useState(!cached);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvatar, setAiAvatar] = useState<string | null>(cached?.aiAvatar ?? null);
  const [aiVoice, setAiVoice] = useState<{ on: boolean; rate: number }>({ on: false, rate: 1 });
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [recordSecs, setRecordSecs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [ticket, setTicket] = useState<SupportTicketInfo | null>(null);
  const [rated, setRated] = useState(false);
  const [peerAvatar, setPeerAvatar] = useState<string | null>(cached?.peerAvatar ?? null);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerMedia | null>(null);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [forwardChats, setForwardChats] = useState<ConversationListItem[]>([]);
  const [uploads, setUploads] = useState<{ key: string; label: string; failed?: string; retry?: () => void }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [sendPolicy, setSendPolicy] = useState<"all" | "admins">("all");
  const [iAmAdmin, setIAmAdmin] = useState(false);
  const welcomed = useRef(false);
  const { allowPath } = useStudyLock();
  const [listing, setListing] = useState<{ title: string; price: number | null; image: string | null; href: string } | null>(null);

  const isAi = kind === "ai";
  const isSupport = kind === "support";
  const isGroup = kind === "group" || kind === "class" || kind === "room";
  const canWrite = sendPolicy === "all" || iAmAdmin;

  const loadPeerReads = useCallback(async () => {
    if (!id || !user) return;
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("user_id, last_read_at")
      .eq("conversation_id", id);
    const others = ((parts ?? []) as { user_id: string; last_read_at: string | null }[]).filter(
      (p) => p.user_id !== user.id,
    );
    // A message is "read" once every other member has opened the chat after it.
    const reads = others.map((p) => p.last_read_at).filter((r): r is string => Boolean(r));
    setPeerReadAt(reads.length === others.length && reads.length ? reads.sort()[0] : null);
    return others.map((p) => p.user_id);
  }, [id, user]);

  const loadExtras = useCallback(async () => {
    if (!id) return;
    const [att, rx, st, hd] = await Promise.all([
      supabase.from("message_attachments").select("*").eq("conversation_id", id).order("created_at"),
      supabase.from("message_reactions").select("message_id, user_id, emoji").eq("conversation_id", id),
      supabase.from("message_stars").select("message_id, messages!inner(conversation_id)").eq("messages.conversation_id", id),
      supabase.from("message_hidden").select("message_id, messages!inner(conversation_id)").eq("messages.conversation_id", id),
    ]);
    const byMsg: Record<string, Attachment[]> = {};
    for (const a of (att.data ?? []) as Attachment[]) (byMsg[a.message_id] ??= []).push(a);
    setAttachments(byMsg);
    setReactions((rx.data ?? []) as Reaction[]);
    setStarred(new Set(((st.data ?? []) as { message_id: string }[]).map((r) => r.message_id)));
    setHidden(new Set(((hd.data ?? []) as { message_id: string }[]).map((r) => r.message_id)));
  }, [id]);

  const loadMessages = useCallback(async () => {
    if (!id || !user) return;
    const [{ data: me }, { data: conv }, { data: msgsAll }] = await Promise.all([
      supabase
        .from("conversation_participants")
        .select("cleared_at, role")
        .eq("conversation_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("kind, subject, listing_enquiry_id, business_id, send_policy")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);
    setIAmAdmin(me?.role === "admin");
    setSendPolicy(conv?.send_policy === "admins" ? "admins" : "all");
    void loadExtras();
    const clearedAt = (me?.cleared_at as string | null) ?? null;
    const msgs = ((msgsAll as ChatMessage[]) || []).filter(
      (m) => !clearedAt || new Date(m.created_at) > new Date(clearedAt),
    );
    if (conv) {
      if (conv.kind === "ai") allowPath(`/inbox/${id}`);
      setKind(conv.kind);
    }
    setMessages(msgs);
    setLoading(false);
    void markConversationRead(supabase, id, user.id);

    if (conv) {
      const faces = await loadChatFaces(supabase, user.id, [
        { id, kind: conv.kind, businessId: (conv.business_id as string | null) ?? null },
      ]);
      const face = faces.get(id);
      setTitle(
        conversationTitle({
          kind: conv.kind,
          subject: conv.subject,
          peerName: face?.name,
        }),
      );
      setPeerAvatar(face?.avatarUrl ?? null);
      setSubtitle(
        conv.kind === "ai"
          ? "AI tutor"
          : conv.kind === "support"
            ? "CampusOS Support"
            : conv.kind === "direct"
              ? ""
              : kindLabel(conv.kind),
      );
      if (conv.listing_enquiry_id) {
        const { data: enq } = await supabase
          .from("listing_enquiries")
          .select("marketplace_listing_id, unit_id")
          .eq("id", conv.listing_enquiry_id)
          .maybeSingle();
        if (enq?.marketplace_listing_id) {
          const { data: m } = await supabase
            .from("marketplace_listings")
            .select("title, price, image_url")
            .eq("id", enq.marketplace_listing_id)
            .maybeSingle();
          if (m) setListing({ title: m.title, price: m.price, image: m.image_url, href: `/explore/marketplace/${enq.marketplace_listing_id}` });
        } else if (enq?.unit_id) {
          const { data: u } = await supabase.from("property_units").select("title, rent_base").eq("id", enq.unit_id).maybeSingle();
          if (u) setListing({ title: u.title, price: u.rent_base, image: null, href: `/housing/${enq.unit_id}` });
        }
      }
      if (conv.kind === "support") {
        const { data: t } = await supabase
          .from("support_tickets")
          .select("id, number, status, rating")
          .eq("conversation_id", id)
          .maybeSingle();
        if (t) {
          const info = t as SupportTicketInfo;
          setTicket(info);
          setSubtitle(`Ticket #${info.number} · ${TICKET_STATUS_LABEL[info.status] ?? info.status}`);
        }
      }
      if (conv.kind !== "ai" && conv.kind !== "support") {
        const peers = (await loadPeerReads()) ?? [];
        if (peers.length > 1) {
          setSubtitle(`${peers.length + 1} members`);
          const { data: people } = await supabase.rpc("chat_people", { p_ids: peers });
          setNames(
            Object.fromEntries(
              ((people ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]),
            ),
          );
        }
      }
      if (conv.kind === "ai") {
        const { data: ai } = await supabase
          .from("ai_companion_profiles")
          .select("avatar_url, reply_mode, speech_rate")
          .eq("conversation_id", id)
          .maybeSingle();
        setAiAvatar((ai?.avatar_url as string | null) ?? null);
        setAiVoice({ on: ai?.reply_mode === "voice_only", rate: Number(ai?.speech_rate ?? 1) || 1 });
      }
    }
    // First time in the tutor chat: the tutor says hello using the student's profile.
    if (conv?.kind === "ai" && !welcomed.current && !msgs.some((m) => m.message_type !== "system")) {
      welcomed.current = true;
      setAiThinking(true);
      try {
        const { data } = await supabase.functions.invoke("study-tutor", {
          body: { conversationId: id, action: "welcome", rich: true },
        });
        const hello = (data as { message?: ChatMessage } | null)?.message;
        if (hello) setMessages((prev) => (prev.some((m) => m.id === hello.id) ? prev : [...prev, hello]));
      } catch {
        /* the student can still start typing */
      } finally {
        setAiThinking(false);
      }
    }
  }, [id, user, allowPath, loadPeerReads, loadExtras]);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
    }, [loadMessages]),
  );

  useEffect(() => {
    if (!id || loading) return;
    threadCache.set(id, { kind, title, subtitle, messages, aiAvatar, peerAvatar });
  }, [id, loading, kind, title, subtitle, messages, aiAvatar, peerAvatar]);

  useFocusEffect(
    useCallback(() => {
      setOpenConversation(id ?? null);
      return () => {
        setOpenConversation(null);
        stopSpeaking();
      };
    }, [id]),
  );

  // If this chat is the only screen on the stack (opened from a notification or a
  // redirect), phone back must go Home instead of closing the app.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (router.canGoBack()) return false;
        router.replace("/(tabs)");
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`thread-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
          if (user) void markConversationRead(supabase, id, user.id);
          if (row.sender_id && row.sender_id !== user?.id) void loadPeerReads();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          if (row.deleted_at) setMessages((prev) => prev.filter((m) => m.id !== row.id));
          else setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_attachments", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const a = payload.new as Attachment;
          setAttachments((prev) => {
            const list = prev[a.message_id] ?? [];
            return list.some((x) => x.id === a.id) ? prev : { ...prev, [a.message_id]: [...list, a] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${id}` },
        () => {
          void supabase
            .from("message_reactions")
            .select("message_id, user_id, emoji")
            .eq("conversation_id", id)
            .then(({ data }) => setReactions((data ?? []) as Reaction[]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, user, loadPeerReads]);

  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, aiThinking]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecordSecs(Math.floor((Date.now() - recording.startedAt) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  function speak(msgId: string, text: string) {
    if (speakingId === msgId) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(msgId);
    void speakText(stripMarkdown(text), {
      rate: aiVoice.rate,
      onDone: () => setSpeakingId((cur) => (cur === msgId ? null : cur)),
      onError: () => {
        setSpeakingId(null);
        setError("Your phone's text-to-speech is off. Turn on Google Speech Services in Android settings.");
      },
    });
  }

  async function requestAiReply(userText: string) {
    if (!id) return;
    setAiThinking(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("study-tutor", {
        body: { conversationId: id, message: userText, rich: true },
      });
      let json = (data ?? {}) as {
        error?: string;
        message?: ChatMessage;
        speakLocally?: string;
      };
      if (fnError) {
        json = {};
        const ctx = (fnError as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            json = (await ctx.json()) as typeof json;
          } catch {
            // fall through to the generic message
          }
        }
        setError(json.error || "The tutor couldn't reply. Try again.");
        return;
      }
      if (json.error) {
        setError(json.error);
        return;
      }
      if (json.message) {
        const reply = json.message;
        setMessages((prev) => (prev.some((m) => m.id === reply.id) ? prev : [...prev, reply]));
        if (json.speakLocally) speak(reply.id, json.speakLocally);
      }
    } catch {
      setError("Network error talking to AI.");
    } finally {
      setAiThinking(false);
    }
  }

  async function sendBody(body: string) {
    if (!id || !user) return;
    setSending(true);
    setError(null);
    const reply = replyTo;
    try {
      const row = isAi
        ? await sendTextMessage(supabase, {
            conversationId: id,
            senderId: user.id,
            body,
            clientId: cryptoRandom(),
          })
        : await sendMessage(supabase, { conversationId: id, body, replyTo: reply?.id ?? null, clientId: cryptoRandom() });
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      setReplyTo(null);
      if (isAi) void requestAiReply(body);
    } catch (e) {
      setError(errorText(e, "Send failed"));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(body: string) {
    if (!editing) return;
    setSending(true);
    setError(null);
    try {
      const row = await editMessage(supabase, editing.id, body);
      setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
      setEditing(null);
    } catch (e) {
      setError(errorText(e, "Could not edit the message"));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  async function onSend() {
    if (!draft.trim() || sending) return;
    const body = draft.trim();
    setDraft("");
    if (editing) await saveEdit(body);
    else await sendBody(body);
  }

  /** Uploads picked files and sends them. Photos and videos go together as one message. */
  async function sendFiles(files: PickedFile[]) {
    if (!id || !user || !files.length) return;
    const caption = draft.trim();
    if (caption) setDraft("");
    const reply = replyTo;
    setReplyTo(null);
    const visual = files.filter((f) => f.kind === "image" || f.kind === "video");
    const others = files.filter((f) => f.kind !== "image" && f.kind !== "video");
    const batches: PickedFile[][] = [...(visual.length ? [visual] : []), ...others.map((f) => [f])];
    let first = true;
    for (const batch of batches) {
      const text = first ? caption : "";
      first = false;
      const key = cryptoRandom();
      const label = batch.length > 1 ? `${batch.length} files` : batch[0].name;
      const run = async () => {
        setUploads((u) => [...u.filter((x) => x.key !== key), { key, label }]);
        try {
          const uploaded = [];
          for (const f of batch) uploaded.push(await uploadChatFile(id, f));
          const row = await sendMessage(supabase, {
            conversationId: id,
            type: batch[0].kind,
            body: text,
            attachments: uploaded,
            replyTo: reply?.id ?? null,
            clientId: cryptoRandom(),
          });
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          void loadExtras();
          setUploads((u) => u.filter((x) => x.key !== key));
        } catch (e) {
          const msg = e instanceof MediaError ? e.message : errorText(e, "Upload failed");
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, failed: msg, retry: () => void run() } : x)));
        }
      };
      void run();
    }
  }

  async function onAttach(choice: AttachChoice) {
    if (!id) return;
    setError(null);
    try {
      if (choice === "location") {
        const place = await currentPlace();
        const row = await sendMessage(supabase, {
          conversationId: id,
          type: "location",
          body: encodeLocation(place),
          replyTo: replyTo?.id ?? null,
          clientId: cryptoRandom(),
        });
        setReplyTo(null);
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        return;
      }
      const files =
        choice === "gallery" ? await pickFromLibrary() : choice === "camera" ? await pickFromCamera() : await pickDocuments();
      await sendFiles(files);
    } catch (e) {
      setError(e instanceof MediaError ? e.message : errorText(e, "Couldn't attach that"));
    }
  }

  function startReply(msg: ChatMessage) {
    setEditing(null);
    setReplyTo(msg);
  }

  function startEdit(msg: ChatMessage) {
    setReplyTo(null);
    setEditing(msg);
    setDraft(msg.body);
  }

  async function react(msg: ChatMessage, emoji: string) {
    if (!user) return;
    const mine = reactions.find((r) => r.message_id === msg.id && r.user_id === user.id);
    setReactions((prev) => {
      const rest = prev.filter((r) => !(r.message_id === msg.id && r.user_id === user.id));
      return mine?.emoji === emoji ? rest : [...rest, { message_id: msg.id, user_id: user.id, emoji }];
    });
    try {
      await reactToMessage(supabase, msg.id, emoji);
    } catch (e) {
      setError(errorText(e, "Could not react"));
      void loadExtras();
    }
  }

  async function star(msg: ChatMessage) {
    try {
      const on = await toggleStar(supabase, msg.id);
      setStarred((prev) => {
        const next = new Set(prev);
        if (on) next.add(msg.id);
        else next.delete(msg.id);
        return next;
      });
    } catch (e) {
      setError(errorText(e, "Could not star the message"));
    }
  }

  async function forwardTo(msg: ChatMessage, targetId: string) {
    setError(null);
    try {
      const atts = attachments[msg.id] ?? [];
      const copied = [];
      for (const a of atts) copied.push(await copyToChat(a, targetId));
      await sendMessage(supabase, {
        conversationId: targetId,
        type: (msg.message_type || "text") as MessageType,
        body: msg.body,
        attachments: copied,
        forwarded: true,
        clientId: cryptoRandom(),
      });
      notify("Forwarded", undefined, undefined, { tone: "success" });
    } catch (e) {
      setError(errorText(e, "Could not forward the message"));
    }
  }

  function openForward(msg: ChatMessage) {
    setForwarding(msg);
    if (user && !forwardChats.length) {
      void loadConversations(supabase, user.id).then(setForwardChats).catch(() => undefined);
    }
  }

  function onSheetAction(msg: ChatMessage, action: MessageAction) {
    switch (action) {
      case "reply":
        return startReply(msg);
      case "copy":
        return void Clipboard.setStringAsync(msg.body);
      case "forward":
        return openForward(msg);
      case "star":
        return void star(msg);
      case "edit":
        return startEdit(msg);
      case "read":
        return speak(msg.id, msg.body);
      case "delete-me":
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        return void hideMessage(supabase, msg.id).catch((e) => {
          setError(errorText(e, "Could not delete the message"));
          void loadMessages();
        });
      case "delete-all":
        return notify("Delete for everyone?", "It disappears for everyone in this chat.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
              deleteMessage(supabase, msg.id).catch((e) => {
                setError(errorText(e, "Could not delete the message"));
                void loadMessages();
              });
            },
          },
        ]);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("Allow microphone access to send voice notes.");
        return;
      }
      stopSpeaking();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordSecs(0);
      setRecording({ startedAt: Date.now() });
    } catch {
      setError("Couldn't start the microphone.");
    }
  }

  async function finishRecording(send: boolean) {
    if (!recording) return;
    setRecording(null);
    try {
      await recorder.stop();
    } catch {
      /* already stopped */
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    const uri = recorder.uri;
    if (!send || !uri || !id) return;
    if (Date.now() - recording.startedAt < 800) {
      setError("Hold on a little longer, then tap send.");
      return;
    }
    setTranscribing(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("conversationId", id);
      form.append("file", { uri, name: "voice.m4a", type: "audio/m4a" } as unknown as Blob);
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/study-tutor`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${s.session?.access_token ?? ""}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !json.text) {
        setError(json.error || "Couldn't understand that voice note.");
        return;
      }
      await sendBody(json.text);
    } catch {
      setError("Network error sending the voice note.");
    } finally {
      setTranscribing(false);
    }
  }

  function onMessageMenu(msg: ChatMessage) {
    if (msg.message_type === "system") return;
    setMenuFor(msg);
  }

  const sheetCan = menuFor
    ? (() => {
        const mine = menuFor.sender_id === user?.id;
        const type = menuFor.message_type || "text";
        const young = (ms: number) => Date.now() - new Date(menuFor.created_at).getTime() < ms;
        return {
          copy: Boolean(menuFor.body) && type === "text",
          forward: !isAi && ["text", "image", "video", "file", "location"].includes(type),
          edit: mine && !isAi && ["text", "image", "video", "file"].includes(type) && young(15 * 60 * 1000),
          read: isAi && !mine && Boolean(menuFor.body),
          deleteAll: isAi || (mine && young(60 * 60 * 1000)),
          react: !isAi,
        };
      })()
    : { copy: false, forward: false, edit: false, read: false, deleteAll: false, react: false };

  function onChatMenu() {
    if (!id) return;
    const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (isAi) {
      buttons.push({ text: "Tutor settings", onPress: () => router.push(`/inbox/ai-profile?conversationId=${id}`) });
    } else if (!isSupport) {
      buttons.push({ text: isGroup ? "Group info" : "View contact", onPress: () => router.push(`/inbox/info?id=${id}`) });
    }
    buttons.push({
      text: "Clear chat",
      onPress: () =>
        notify(
          "Clear this chat?",
          isAi ? "Your tutor forgets this conversation." : "Only your copy is cleared.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Clear",
              style: "destructive",
              onPress: () => {
                clearConversation(supabase, id)
                  .then(() => {
                    setMessages([]);
                    setError(null);
                  })
                  .catch((e) => setError(errorText(e, "Could not clear the chat")));
              },
            },
          ],
        ),
    });
    if (!isSupport) {
      buttons.push({
        text: "Delete chat",
        style: "destructive",
        onPress: () =>
          notify("Delete this chat?", "It comes back if someone writes again.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                deleteConversation(supabase, id)
                  .then(() => (router.canGoBack() ? router.back() : router.replace("/(tabs)")))
                  .catch((e) => setError(errorText(e, "Could not delete the chat")));
              },
            },
          ]),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    actionSheet(title, buttons);
  }

  function openProfile() {
    if (!id || isSupport) return;
    if (isAi) {
      router.push(`/inbox/ai-profile?conversationId=${id}`);
      return;
    }
    router.push(`/inbox/info?id=${id}`);
  }

  function playVoice(msg: ChatMessage) {
    const text =
      msg.media_url && msg.media_url.startsWith("local-tts:")
        ? decodeURIComponent(msg.media_url.replace("local-tts:", ""))
        : msg.body && msg.body !== "Voice message"
          ? msg.body
          : null;
    if (text) speak(msg.id, text);
  }

  const status = aiThinking && isAi ? "typing…" : subtitle;
  const canSend = Boolean(draft.trim()) && !sending;
  const showMic = isAi && !draft.trim();

  const shownMessages = messages.filter((m) => {
    if (hidden.has(m.id)) return false;
    const q = searchQ.trim().toLowerCase();
    return !searchOpen || !q || (m.body || "").toLowerCase().includes(q);
  });
  const msgById = new Map(messages.map((m) => [m.id, m]));
  const nameOf = (senderId: string | null) =>
    senderId === user?.id ? "You" : (senderId && names[senderId]) || title || "Message";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={[styles.top, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.fg} />
        </Pressable>
        <Pressable onPress={openProfile} style={styles.headerMain}>
          {isAi ? (
            <AiAvatar avatarKey={aiAvatar} size={40} />
          ) : isSupport ? (
            <View style={[styles.supportBadge, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="headset" size={20} color={colors.fg} />
            </View>
          ) : (
            <Avatar label={title || "?"} size={40} uri={peerAvatar} />
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText weight="700" size={16} numberOfLines={1} style={{ flexShrink: 1 }}>
                {title}
              </AppText>
            </View>
            {status ? (
              <AppText size={12} numberOfLines={1} style={{ color: aiThinking && isAi ? colors.success : colors.muted }}>
                {status}
              </AppText>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            setSearchOpen((v) => !v);
            setSearchQ("");
          }}
          style={styles.iconBtn}
          accessibilityLabel="Search in chat"
        >
          <Ionicons name="search" size={19} color={colors.fg} />
        </Pressable>
        <Pressable onPress={onChatMenu} style={styles.iconBtn} accessibilityLabel="Chat options">
          <Ionicons name="ellipsis-vertical" size={18} color={colors.fg} />
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={[styles.rateBar, { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            autoFocus
            value={searchQ}
            onChangeText={setSearchQ}
            placeholder="Search in this chat"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, color: colors.fg, paddingVertical: 4 }}
          />
          {searchQ ? (
            <AppText size={12} muted>
              {shownMessages.length} found
            </AppText>
          ) : null}
        </View>
      ) : null}

      {listing ? (
        <Pressable
          onPress={() => router.push(listing.href as never)}
          style={[styles.listingCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        >
          {listing.image ? (
            <Image source={{ uri: listing.image }} style={styles.listingThumb} />
          ) : (
            <View style={[styles.listingThumb, { backgroundColor: colors.heroBg, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="pricetag-outline" size={18} color={colors.heroMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText weight="700" size={13} numberOfLines={1}>
              {listing.title}
            </AppText>
            {listing.price != null ? (
              <AppText size={12} muted>
                {formatNaira(listing.price)}
              </AppText>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: palette.wall }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 24}
      >
        <FlatList
          ref={listRef}
          data={shownMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 }}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.fg} style={{ marginTop: 32 }} />
            ) : !aiThinking ? (
              <View style={[styles.chip, { backgroundColor: palette.chip, marginTop: 24 }]}>
                <AppText size={12} muted style={{ textAlign: "center" }}>
                  {isAi ? "Ask anything about your courses." : "No messages yet"}
                </AppText>
              </View>
            ) : undefined
          }
          renderItem={({ item, index }: { item: ChatMessage; index: number }) => {
            const mine = item.sender_id === user?.id;
            const prev = shownMessages[index - 1];
            const showDay = !prev || dayKey(prev.created_at) !== dayKey(item.created_at);
            const firstOfGroup =
              showDay ||
              !prev ||
              prev.sender_id !== item.sender_id ||
              prev.message_type === "system" ||
              new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_GAP_MS;
            const dayChip = showDay ? (
              <View style={[styles.chip, { backgroundColor: palette.chip }]}>
                <AppText size={12} weight="600" muted>
                  {dayLabel(item.created_at)}
                </AppText>
              </View>
            ) : null;

            if (item.message_type === "system") {
              return (
                <View>
                  {dayChip}
                  <View style={[styles.chip, { backgroundColor: palette.chip, maxWidth: "86%" }]}>
                    <AppText muted size={12} style={{ textAlign: "center" }}>
                      {item.body}
                    </AppText>
                  </View>
                </View>
              );
            }

            const isAudio = item.message_type === "audio";
            const isLocation = item.message_type === "location";
            const itemAtts = attachments[item.id] ?? [];
            const itemReactions = reactions.filter((r) => r.message_id === item.id);
            const original = item.reply_to_id ? (msgById.get(item.reply_to_id) ?? null) : null;
            const fromAi = isAi && !mine;
            const read = mine && peerReadAt && new Date(peerReadAt) >= new Date(item.created_at);
            const senderName = isGroup && !mine && firstOfGroup && item.sender_id ? names[item.sender_id] : null;
            return (
              <View style={{ marginTop: firstOfGroup ? 8 : 2 }}>
                {dayChip}
                <Pressable
                  onLongPress={() => onMessageMenu(item)}
                  delayLongPress={350}
                  style={[
                    styles.bubble,
                    {
                      alignSelf: mine ? "flex-end" : "flex-start",
                      backgroundColor: mine ? palette.mine : palette.theirs,
                    },
                    fromAi && !isAudio ? styles.bubbleWide : null,
                    firstOfGroup && (mine ? styles.tailMine : styles.tailTheirs),
                  ]}
                >
                  {senderName ? (
                    <AppText size={12} weight="700" style={{ color: nameColor(item.sender_id!), marginBottom: 2 }}>
                      {senderName}
                    </AppText>
                  ) : null}
                  {item.forwarded ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <Ionicons name="arrow-redo" size={12} color={colors.muted} />
                      <AppText size={11} muted style={{ fontStyle: "italic" }}>
                        Forwarded
                      </AppText>
                    </View>
                  ) : null}
                  {item.reply_to_id ? <ReplyQuote original={original} nameOf={nameOf} /> : null}
                  {itemAtts.length ? <AttachmentList items={itemAtts} onOpen={setViewer} /> : null}
                  {isLocation ? <LocationCard body={item.body} /> : null}
                  {isLocation || (itemAtts.length > 0 && !item.body) ? null : isAudio ? (
                    <Pressable onPress={() => playVoice(item)} style={styles.audioRow}>
                      <Ionicons
                        name={speakingId === item.id ? "pause-circle" : "play-circle"}
                        size={30}
                        color={colors.fg}
                      />
                      <View style={[styles.wave, { backgroundColor: colors.muted }]} />
                    </Pressable>
                  ) : (
                    fromAi && item.body ? (
                      <RichText text={item.body} />
                    ) : (
                      <AppText size={15} style={{ color: colors.fg, lineHeight: 21 }}>
                        {item.body}
                      </AppText>
                    )
                  )}
                  <View style={styles.meta}>
                    {fromAi && item.body ? (
                      <Pressable
                        onPress={() => speak(item.id, item.body)}
                        hitSlop={10}
                        accessibilityLabel={speakingId === item.id ? "Stop reading" : "Read aloud"}
                        style={{ marginRight: "auto" }}
                      >
                        <Ionicons
                          name={speakingId === item.id ? "stop-circle" : "volume-medium-outline"}
                          size={16}
                          color={speakingId === item.id ? colors.success : colors.muted}
                        />
                      </Pressable>
                    ) : null}
                    {starred.has(item.id) ? <Ionicons name="star" size={11} color={colors.accent} /> : null}
                    {item.edited_at ? (
                      <AppText size={10} muted>
                        edited
                      </AppText>
                    ) : null}
                    <AppText size={10} muted>
                      {timeLabel(item.created_at)}
                    </AppText>
                    {mine && !isAi ? (
                      <Ionicons
                        name={read ? "checkmark-done" : "checkmark"}
                        size={14}
                        color={read ? READ_BLUE : colors.muted}
                      />
                    ) : null}
                  </View>
                  <ReactionChips items={itemReactions} myId={user?.id} onPress={(emoji) => void react(item, emoji)} />
                </Pressable>
              </View>
            );
          }}
          ListFooterComponent={
            <View>
              {aiThinking ? <TypingBubble color={palette.theirs} dot={colors.muted} /> : null}
              {transcribing ? (
                <View style={[styles.bubble, styles.tailMine, { alignSelf: "flex-end", backgroundColor: palette.mine, marginTop: 8 }]}>
                  <AppText size={13} muted>
                    Sending voice note…
                  </AppText>
                </View>
              ) : null}
              {uploads.map((u) => (
                <View
                  key={u.key}
                  style={[styles.bubble, styles.tailMine, { alignSelf: "flex-end", backgroundColor: palette.mine, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }]}
                >
                  {u.failed ? (
                    <Pressable onPress={u.retry} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="refresh" size={16} color={colors.danger} />
                      <AppText size={13} style={{ color: colors.danger }}>
                        Tap to retry · {u.label}
                      </AppText>
                    </Pressable>
                  ) : (
                    <>
                      <ActivityIndicator size="small" color={colors.fg} />
                      <AppText size={13} muted numberOfLines={1}>
                        Sending {u.label}…
                      </AppText>
                    </>
                  )}
                  <Pressable onPress={() => setUploads((x) => x.filter((y) => y.key !== u.key))} hitSlop={8}>
                    <Ionicons name="close" size={14} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
              {error ? (
                <View style={[styles.errorBanner, { backgroundColor: palette.theirs, borderColor: colors.danger }]}>
                  <Ionicons name="alert-circle" size={18} color={colors.danger} />
                  <AppText size={13} style={{ flex: 1 }}>
                    {error}
                  </AppText>
                  <Pressable onPress={() => setError(null)} hitSlop={10}>
                    <Ionicons name="close" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
        />

        {ticket?.status === "resolved" && !ticket.rating && !rated ? (
          <View style={[styles.rateBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <AppText size={13} weight="600">
              Rate this help
            </AppText>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  hitSlop={6}
                  accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
                  onPress={() => {
                    setRated(true);
                    void supabase.rpc("rate_support_ticket", { p_ticket: ticket.id, p_rating: n });
                  }}
                >
                  <Ionicons name="star-outline" size={26} color={colors.accent} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : rated ? (
          <AppText muted size={12} style={{ textAlign: "center", paddingVertical: 8 }}>
            Thanks for rating.
          </AppText>
        ) : null}

        {!canWrite ? (
          <View style={[styles.rateBar, { backgroundColor: colors.surface, borderTopColor: colors.border, justifyContent: "center", paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
            <AppText size={13} muted>
              Only admins can send messages here
            </AppText>
          </View>
        ) : (
        <>
        {replyTo || editing ? (
          <View style={[styles.rateBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Ionicons name={editing ? "create-outline" : "arrow-undo-outline"} size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText size={12} weight="700" style={{ color: colors.accent }}>
                {editing ? "Editing message" : `Replying to ${nameOf((replyTo as ChatMessage).sender_id)}`}
              </AppText>
              <AppText size={13} muted numberOfLines={1}>
                {previewForMessage(editing ?? (replyTo as ChatMessage))}
              </AppText>
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => {
                if (editing) setDraft("");
                setEditing(null);
                setReplyTo(null);
              }}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {!isAi && !recording && !editing ? (
            <Pressable onPress={() => setAttachOpen(true)} style={styles.attachBtn} accessibilityLabel="Attach">
              <Ionicons name="add-circle" size={32} color={colors.accent} />
            </Pressable>
          ) : null}
          {recording ? (
            <View style={[styles.inputPill, { backgroundColor: palette.composer }]}>
              <Pressable onPress={() => void finishRecording(false)} hitSlop={10} accessibilityLabel="Cancel voice note">
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
              <View style={[styles.recDot, { backgroundColor: colors.danger }]} />
              <AppText size={15} weight="600" style={{ flex: 1 }}>
                {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, "0")}
              </AppText>
              <AppText size={12} muted>
                Recording
              </AppText>
            </View>
          ) : (
            <View style={[styles.inputPill, { backgroundColor: palette.composer }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={isAi ? "Ask your tutor" : "Message"}
                placeholderTextColor={colors.muted}
                multiline
                style={[styles.input, { color: colors.fg }]}
              />
            </View>
          )}
          {recording ? (
            <Pressable
              onPress={() => void finishRecording(true)}
              style={[styles.send, { backgroundColor: colors.inverseBg }]}
              accessibilityLabel="Send voice note"
            >
              <Ionicons name="send" size={18} color={colors.inverseFg} />
            </Pressable>
          ) : showMic ? (
            <Pressable
              onPress={() => void startRecording()}
              disabled={transcribing || aiThinking}
              style={[styles.send, { backgroundColor: colors.inverseBg, opacity: transcribing || aiThinking ? 0.5 : 1 }]}
              accessibilityLabel="Record a voice note"
            >
              <Ionicons name="mic" size={20} color={colors.inverseFg} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void onSend()}
              disabled={!canSend}
              style={[styles.send, { backgroundColor: colors.inverseBg, opacity: canSend ? 1 : 0.5 }]}
              accessibilityLabel="Send"
            >
              <Ionicons name="send" size={18} color={colors.inverseFg} />
            </Pressable>
          )}
        </View>
        </>
        )}
      </KeyboardAvoidingView>

      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onChoose={(c) => void onAttach(c)} />
      <MessageSheet
        visible={Boolean(menuFor)}
        onClose={() => setMenuFor(null)}
        onReact={(e) => menuFor && void react(menuFor, e)}
        onAction={(a) => menuFor && onSheetAction(menuFor, a)}
        myReaction={menuFor ? (reactions.find((r) => r.message_id === menuFor.id && r.user_id === user?.id)?.emoji ?? null) : null}
        starred={menuFor ? starred.has(menuFor.id) : false}
        can={sheetCan}
      />
      <ForwardSheet
        visible={Boolean(forwarding)}
        onClose={() => setForwarding(null)}
        chats={forwardChats}
        currentId={id ?? ""}
        onPick={(target) => {
          const m = forwarding;
          setForwarding(null);
          if (m) void forwardTo(m, target);
        }}
      />
      <MediaViewer media={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function TypingBubble({ color, dot }: { color: string; dot: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(anim, { toValue: 3, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <View style={[styles.bubble, styles.tailTheirs, styles.typing, { backgroundColor: color, alignSelf: "flex-start", marginTop: 8 }]}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            {
              backgroundColor: dot,
              opacity: anim.interpolate({
                inputRange: [0, 1, 2, 3],
                outputRange: [i === 0 ? 1 : 0.35, i === 1 ? 1 : 0.35, i === 2 ? 1 : 0.35, i === 0 ? 1 : 0.35],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

/** messages.client_id is a uuid column, so this must be a real v4 uuid. */
function cryptoRandom() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Supabase errors are plain objects, not Error instances. */
function errorText(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: { alignItems: "center", justifyContent: "center" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  listingCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  listingThumb: { width: 40, height: 40, borderRadius: 8 },
  headerMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rateBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  supportBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginVertical: 8,
  },
  bubble: {
    maxWidth: "82%",
    minWidth: 76,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleWide: { maxWidth: "94%", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  tailMine: { borderTopRightRadius: 3 },
  tailTheirs: { borderTopLeftRadius: 3 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 2,
  },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 160 },
  wave: { flex: 1, height: 3, borderRadius: 2, opacity: 0.5 },
  typing: { flexDirection: "row", gap: 5, paddingVertical: 12, minWidth: 0 },
  typingDot: { width: 7, height: 7, borderRadius: 4 },
  attachBtn: { width: 36, height: 44, alignItems: "center", justifyContent: "center" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  inputPill: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingVertical: 10,
    fontSize: 16,
  },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
});
