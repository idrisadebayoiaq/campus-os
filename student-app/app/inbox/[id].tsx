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
import { AiAvatar } from "@/src/lib/ai-avatars";
import { useAuth } from "@/src/lib/auth";
import { actionSheet, notify } from "@/src/lib/feedback";
import { setOpenConversation } from "@/src/lib/push";
import { useStudyLock } from "@/src/lib/study-lock";
import { formatNaira } from "@/src/lib/campus";
import {
  clearConversation,
  conversationTitle,
  deleteConversation,
  loadChatFaces,
  deleteMessage,
  kindLabel,
  markConversationRead,
  sendTextMessage,
  type ChatMessage,
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

export default function ChatThreadScreen() {
  const { id, draft: initialDraft } = useLocalSearchParams<{
    id: string;
    draft?: string;
  }>();
  const { user } = useAuth();
  const colors = useTheme();
  const { resolved } = useThemeControls();
  const palette = resolved === "dark" ? CHAT.dark : CHAT.light;
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("direct");
  const [subtitle, setSubtitle] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvatar, setAiAvatar] = useState<string | null>(null);
  const [aiVoice, setAiVoice] = useState<{ on: boolean; rate: number }>({ on: false, rate: 1 });
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [recordSecs, setRecordSecs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [ticket, setTicket] = useState<SupportTicketInfo | null>(null);
  const [rated, setRated] = useState(false);
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const welcomed = useRef(false);
  const { allowPath } = useStudyLock();
  const [listing, setListing] = useState<{ title: string; price: number | null; image: string | null; href: string } | null>(null);

  const isAi = kind === "ai";
  const isSupport = kind === "support";
  const isGroup = kind === "group";

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

  const loadMessages = useCallback(async () => {
    if (!id || !user) return;
    const { data: me } = await supabase
      .from("conversation_participants")
      .select("cleared_at")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    const clearedAt = (me?.cleared_at as string | null) ?? null;
    const [{ data: conv }, { data: msgsAll }] = await Promise.all([
      supabase
        .from("conversations")
        .select("kind, subject, listing_enquiry_id, business_id")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("messages")
        .select(
          "id, conversation_id, body, sender_id, created_at, edited_at, deleted_at, message_type, media_url, media_duration_ms, client_id",
        )
        .eq("conversation_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);
    if (conv) {
      if (conv.kind === "ai") allowPath(`/inbox/${id}`);
      setKind(conv.kind);
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
    const msgs = ((msgsAll as ChatMessage[]) || []).filter(
      (m) => !clearedAt || new Date(m.created_at) > new Date(clearedAt),
    );
    setMessages(msgs);
    await markConversationRead(supabase, id, user.id);
    setLoading(false);

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
  }, [id, user, allowPath, loadPeerReads]);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
    }, [loadMessages]),
  );

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
    try {
      const row = await sendTextMessage(supabase, {
        conversationId: id,
        senderId: user.id,
        body,
        clientId: cryptoRandom(),
      });
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      if (isAi) void requestAiReply(body);
    } catch (e) {
      setError(errorText(e, "Send failed"));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  async function onSend() {
    if (!draft.trim() || sending) return;
    const body = draft.trim();
    setDraft("");
    await sendBody(body);
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
    const canDelete = msg.sender_id === user?.id || isAi;
    const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (isAi && msg.sender_id !== user?.id && msg.body) {
      buttons.push({ text: "Read aloud", onPress: () => speak(msg.id, msg.body) });
    }
    if (canDelete) {
      buttons.push({
        text: "Delete message",
        style: "destructive",
        onPress: () => {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          deleteMessage(supabase, msg.id).catch((e) => {
            setError(errorText(e, "Could not delete the message"));
            void loadMessages();
          });
        },
      });
    }
    if (!buttons.length) return;
    buttons.push({ text: "Cancel", style: "cancel" });
    actionSheet("Message", buttons);
  }

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

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.wall, flex: 1 }]}>
        <ActivityIndicator color={colors.fg} />
      </View>
    );
  }

  const status = aiThinking && isAi ? "typing…" : subtitle;
  const canSend = Boolean(draft.trim()) && !sending;
  const showMic = isAi && !draft.trim();

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
        <Pressable onPress={onChatMenu} style={styles.iconBtn} accessibilityLabel="Chat options">
          <Ionicons name="ellipsis-vertical" size={18} color={colors.fg} />
        </Pressable>
      </View>

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
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 }}
          ListEmptyComponent={
            !aiThinking ? (
              <View style={[styles.chip, { backgroundColor: palette.chip, marginTop: 24 }]}>
                <AppText size={12} muted style={{ textAlign: "center" }}>
                  {isAi ? "Ask anything about your courses." : "No messages yet"}
                </AppText>
              </View>
            ) : undefined
          }
          renderItem={({ item, index }: { item: ChatMessage; index: number }) => {
            const mine = item.sender_id === user?.id;
            const prev = messages[index - 1];
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
                  {isAudio ? (
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

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
      </KeyboardAvoidingView>
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
