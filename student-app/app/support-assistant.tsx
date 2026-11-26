import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { AppText } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { callAssistant, type AssistantMessage, type AssistantResult } from "@/src/lib/support";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const STARTERS = [
  "How do I verify my student ID?",
  "The agent wants a deposit before inspection",
  "I forgot my password",
  "How do I change my location?",
];

type Ticket = NonNullable<AssistantResult["ticket"]>;

export default function SupportAssistantScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AssistantMessage>>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await callAssistant(supabase, { action: "open" });
      if (res.error) setError(res.error);
      setMessages(res.messages ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, thinking, ticket]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || thinking || !user) return;
    setDraft("");
    setError(null);
    setThinking(true);
    const optimistic: AssistantMessage = {
      id: `local-${Date.now()}`,
      body,
      sender_id: user.id,
      message_type: "text",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const res = await callAssistant(supabase, { action: "send", message: body });
    setThinking(false);
    if (res.error) {
      setError(res.error);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      return;
    }
    setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), ...(res.messages ?? [])]);
    if (res.ticket) setTicket(res.ticket);
  }

  async function handoff() {
    if (thinking) return;
    setThinking(true);
    setError(null);
    const res = await callAssistant(supabase, { action: "handoff" });
    setThinking(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessages((prev) => [...prev, ...(res.messages ?? [])]);
    if (res.ticket) setTicket(res.ticket);
  }

  const asked = messages.some((m) => m.sender_id === user?.id);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.fg} />
        </Pressable>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <AppText size={13} weight="700" style={{ color: colors.onAccent }}>
            AI
          </AppText>
          <View style={[styles.online, { backgroundColor: colors.success, borderColor: colors.bg }]} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="700" size={16} numberOfLines={1}>
            CampusOS Assistant
          </AppText>
          <AppText muted size={12} numberOfLines={1}>
            Replies instantly · can pass you to a person
          </AppText>
        </View>
        <Pressable
          onPress={() => void handoff()}
          disabled={thinking || loading}
          style={[styles.personBtn, { borderColor: colors.border, opacity: thinking || loading ? 0.5 : 1 }]}
        >
          <Ionicons name="person-outline" size={14} color={colors.fg} />
          <AppText size={12} weight="700">
            Person
          </AppText>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 24}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.fg} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 14, paddingBottom: 20, gap: 8 }}
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              if (item.message_type === "system") {
                return (
                  <AppText muted size={12} style={{ textAlign: "center", marginVertical: 6 }}>
                    {item.body}
                  </AppText>
                );
              }
              return (
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? { alignSelf: "flex-end", backgroundColor: colors.accent }
                      : {
                          alignSelf: "flex-start",
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        },
                  ]}
                >
                  <AppText size={15} style={{ color: mine ? colors.onAccent : colors.fg, lineHeight: 21 }}>
                    {item.body}
                  </AppText>
                </View>
              );
            }}
            ListFooterComponent={
              <View style={{ gap: 10, marginTop: 4 }}>
                {thinking ? (
                  <View style={[styles.bubble, { alignSelf: "flex-start", backgroundColor: colors.surface }]}>
                    <AppText muted size={14}>
                      Typing…
                    </AppText>
                  </View>
                ) : null}
                {ticket ? (
                  <View style={[styles.ticketCard, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                    <AppText weight="700" size={14}>
                      Ticket #{ticket.number} is with the support team
                    </AppText>
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: "/inbox/[id]", params: { id: ticket.conversation_id } })
                      }
                      style={[styles.ticketBtn, { backgroundColor: colors.accent }]}
                    >
                      <AppText size={13} weight="700" style={{ color: colors.onAccent }}>
                        Open ticket chat
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}
                {!asked && !thinking ? (
                  <View style={styles.starters}>
                    {STARTERS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => void send(s)}
                        style={[styles.starter, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      >
                        <AppText size={13}>{s}</AppText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {error ? (
                  <AppText size={12} style={{ color: colors.danger }}>
                    {error}
                  </AppText>
                ) : null}
              </View>
            }
          />
        )}

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
            placeholder="Ask the assistant anything…"
            placeholderTextColor={colors.muted}
            multiline
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
                color: colors.fg,
              },
            ]}
          />
          <Pressable
            onPress={() => void send(draft)}
            disabled={thinking || !draft.trim()}
            style={[
              styles.send,
              { backgroundColor: colors.accent, opacity: thinking || !draft.trim() ? 0.5 : 1 },
            ]}
            accessibilityLabel="Send"
          >
            <Ionicons name="send" size={18} color={colors.onAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  online: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  personBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "85%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  ticketCard: { borderWidth: 1, borderRadius: radii.md, padding: 14, gap: 10, alignItems: "center" },
  ticketBtn: { borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8 },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  starter: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8 },
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
    borderWidth: 1.5,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
