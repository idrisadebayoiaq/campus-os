import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Avatar } from "@/src/components/ui";
import { AiAvatar } from "@/src/lib/ai-avatars";
import { useAuth } from "@/src/lib/auth";
import {
  conversationTitle,
  kindLabel,
  markConversationRead,
  sendTextMessage,
  type ChatMessage,
} from "@/src/lib/messaging";
import { speakText } from "@/src/lib/speech";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const WEB_URL = (process.env.EXPO_PUBLIC_STUDENT_WEB_URL ?? "").replace(
  /\/+$/,
  "",
);

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
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ChatThreadScreen() {
  const { id, draft: initialDraft } = useLocalSearchParams<{
    id: string;
    draft?: string;
  }>();
  const { user, session } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const [title, setTitle] = useState("Chat");
  const [kind, setKind] = useState("direct");
  const [subtitle, setSubtitle] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvatar, setAiAvatar] = useState<string | null>(null);

  const isAi = kind === "ai";
  const isSupport = kind === "support";

  const loadMessages = useCallback(async () => {
    if (!id || !user) return;
    const [{ data: conv }, { data: msgs }] = await Promise.all([
      supabase
        .from("conversations")
        .select("kind, subject")
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
      setKind(conv.kind);
      setTitle(
        conversationTitle({
          kind: conv.kind,
          subject: conv.subject,
        }),
      );
      setSubtitle(
        conv.kind === "ai"
          ? "AI tutor · tap for settings"
          : conv.kind === "support"
            ? "CampusOS team · usually replies within a day"
            : kindLabel(conv.kind),
      );
      if (conv.kind === "ai") {
        const { data: ai } = await supabase
          .from("ai_companion_profiles")
          .select("avatar_url")
          .eq("conversation_id", id)
          .maybeSingle();
        setAiAvatar((ai?.avatar_url as string | null) ?? null);
      }
    }
    setMessages((msgs as ChatMessage[]) || []);
    await markConversationRead(supabase, id, user.id);
    setLoading(false);
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
    }, [loadMessages]),
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
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, user]);

  useEffect(() => {
    if (!messages.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, aiThinking]);

  async function requestAiReply(userText: string) {
    if (!WEB_URL || !id) return;
    setAiThinking(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token =
        sessionData.session?.access_token || session?.access_token || null;
      if (!token) {
        setError("Session expired. Sign in again to chat with AI.");
        return;
      }
      const res = await fetch(`${WEB_URL}/api/study/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversationId: id, message: userText }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: ChatMessage;
        speakLocally?: string;
      };
      if (!res.ok) {
        setError(json.error || "AI could not reply.");
        return;
      }
      if (json.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === json.message!.id)
            ? prev
            : [...prev, json.message!],
        );
      }
      if (json.speakLocally) {
        speakText(json.speakLocally, 0.95);
      }
    } catch {
      setError("Network error talking to AI.");
    } finally {
      setAiThinking(false);
    }
  }

  async function onSend() {
    if (!id || !user || !draft.trim() || sending) return;
    const body = draft.trim();
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const row = await sendTextMessage(supabase, {
        conversationId: id,
        senderId: user.id,
        body,
        clientId: cryptoRandom(),
      });
      setMessages((prev) =>
        prev.some((m) => m.id === row.id) ? prev : [...prev, row],
      );
      if (isAi) {
        void requestAiReply(body);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      setDraft(body);
    } finally {
      setSending(false);
    }
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
    if (text) speakText(text, 0.95);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, flex: 1 }]}>
        <ActivityIndicator color={colors.fg} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
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
            <Avatar label={title} size={40} />
          )}
          <View style={{ flex: 1 }}>
            <AppText weight="700" size={16} numberOfLines={1}>
              {title}
            </AppText>
            <AppText muted size={12} numberOfLines={1}>
              {subtitle}
            </AppText>
          </View>
        </Pressable>
        {isSupport ? (
          <View style={styles.iconBtn} />
        ) : (
          <Pressable onPress={openProfile} style={styles.iconBtn}>
            <Ionicons
              name={isAi ? "settings-outline" : "ellipsis-vertical"}
              size={18}
              color={colors.fg}
            />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 24}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 20, gap: 6 }}
          renderItem={({
            item,
            index,
          }: {
            item: ChatMessage;
            index: number;
          }) => {
            const mine = item.sender_id === user?.id;
            const prev = messages[index - 1];
            const showDay =
              !prev || dayKey(prev.created_at) !== dayKey(item.created_at);
            const isAudio = item.message_type === "audio";
            if (item.message_type === "system") {
              return (
                <View>
                  {showDay ? (
                    <AppText muted size={11} style={styles.day}>
                      {dayLabel(item.created_at)}
                    </AppText>
                  ) : null}
                  <AppText muted size={12} style={styles.system}>
                    {item.body}
                  </AppText>
                </View>
              );
            }
            return (
              <View>
                {showDay ? (
                  <AppText muted size={11} style={styles.day}>
                    {dayLabel(item.created_at)}
                  </AppText>
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? {
                          alignSelf: "flex-end",
                          backgroundColor: colors.accent,
                        }
                      : {
                          alignSelf: "flex-start",
                          backgroundColor: colors.surface,
                        },
                  ]}
                >
                  {isAudio ? (
                    <Pressable
                      onPress={() => playVoice(item)}
                      style={styles.audioRow}
                    >
                      <Ionicons
                        name="play-circle"
                        size={28}
                        color={mine ? colors.onAccent : colors.fg}
                      />
                      <AppText
                        size={14}
                        weight="600"
                        style={{ color: mine ? colors.onAccent : colors.fg }}
                      >
                        Voice message
                      </AppText>
                    </Pressable>
                  ) : (
                    <AppText
                      size={15}
                      style={{ color: mine ? colors.onAccent : colors.fg }}
                    >
                      {item.body}
                    </AppText>
                  )}
                  <AppText
                    size={10}
                    style={{
                      alignSelf: "flex-end",
                      marginTop: 4,
                      color: mine ? colors.onAccent : colors.muted,
                      opacity: 0.75,
                    }}
                  >
                    {new Date(item.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {item.edited_at ? " · edited" : ""}
                  </AppText>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            aiThinking ? (
              <AppText muted size={12} style={{ marginTop: 8 }}>
                Tutor is typing…
              </AppText>
            ) : error ? (
              <AppText size={12} style={{ color: colors.danger, marginTop: 8 }}>
                {error}
              </AppText>
            ) : (
              <View />
            )
          }
        />

        <View
          style={[
            styles.composer,
            {
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
              backgroundColor: colors.bg,
            },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={
              isAi ? "Ask your tutor…" : isSupport ? "Describe what you need…" : "Message"
            }
            placeholderTextColor={colors.muted}
            multiline
            style={[
              styles.input,
              { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, borderWidth: 1.5, color: colors.fg },
            ]}
          />
          <Pressable
            onPress={() => void onSend()}
            disabled={sending || !draft.trim()}
            style={[
              styles.send,
              {
                backgroundColor: colors.accent,
                opacity: sending || !draft.trim() ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons name="send" size={18} color={colors.onAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function cryptoRandom() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  supportBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  day: { textAlign: "center", marginVertical: 10 },
  system: { textAlign: "center", marginVertical: 6, paddingHorizontal: 24 },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 2,
  },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
