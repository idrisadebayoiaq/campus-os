import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import {
  STUDENT_TOPICS,
  TICKET_STATUS_LABEL,
  loadMyTickets,
  type SupportTicketRow,
} from "@/src/lib/support";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const SUPPORT_EMAIL = "support@campusos.app";

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SupportScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      void loadMyTickets(supabase, user.id).then((rows) => {
        if (!cancelled) setTickets(rows);
      });
      return () => {
        cancelled = true;
      };
    }, [user]),
  );

  const statusColor = (s: SupportTicketRow["status"]) =>
    s === "resolved" ? colors.success : s === "waiting" ? colors.accent : colors.muted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
          style={[styles.back, { backgroundColor: colors.surface }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Help & support
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 22,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 4 }}>
          <AppText size={24} weight="700">
            How can we help?
          </AppText>
          <AppText muted size={14}>
            Get an instant answer, or go straight to a person on the support team.
          </AppText>
        </View>

        <Pressable
          onPress={() => router.push("/support-assistant")}
          style={({ pressed }) => [
            styles.choice,
            { backgroundColor: colors.heroBg, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <View style={styles.choiceHead}>
            <View style={[styles.choiceIcon, { backgroundColor: colors.accent }]}>
              <AppText weight="700" style={{ color: colors.onAccent }}>
                AI
              </AppText>
            </View>
            <View style={[styles.tag, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <AppText size={12} weight="600" style={{ color: colors.heroFg }}>
                Instant · 24/7
              </AppText>
            </View>
          </View>
          <AppText size={19} weight="700" style={{ color: colors.heroFg }}>
            Chat live
          </AppText>
          <AppText size={13} style={{ color: colors.heroMuted, lineHeight: 19 }}>
            The CampusOS Assistant answers right away. If it can&apos;t help, it opens a ticket and
            passes you to the team.
          </AppText>
          <View style={styles.choiceCta}>
            <AppText weight="700" style={{ color: colors.accent }}>
              Start chat
            </AppText>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.push("/support-new")}
          style={({ pressed }) => [
            styles.choice,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <View style={styles.choiceHead}>
            <View style={[styles.choiceIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="headset" size={22} color={colors.fg} />
            </View>
            <View style={[styles.tag, { backgroundColor: colors.bg }]}>
              <AppText size={12} weight="600" muted>
                A person replies
              </AppText>
            </View>
          </View>
          <AppText size={19} weight="700">
            Chat with support
          </AppText>
          <AppText size={13} muted style={{ lineHeight: 19 }}>
            Open a ticket with the CampusOS team. Best for payments, scams, account access or
            anything urgent.
          </AppText>
          <View style={styles.choiceCta}>
            <AppText weight="700" style={{ color: colors.accent }}>
              Open a ticket
            </AppText>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </View>
        </Pressable>

        {tickets.length ? (
          <View style={{ gap: 8 }}>
            <AppText muted size={12} weight="600" style={{ marginLeft: 4 }}>
              YOUR TICKETS
            </AppText>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {tickets.map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() =>
                    router.push({ pathname: "/inbox/[id]", params: { id: t.conversation_id } })
                  }
                  style={({ pressed }) => [
                    styles.row,
                    i < tickets.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText size={15} weight="600" numberOfLines={1}>
                      {t.subject}
                    </AppText>
                    <AppText muted size={12}>
                      #{t.number} · {timeAgo(t.last_message_at)}
                    </AppText>
                  </View>
                  <View style={[styles.status, { borderColor: statusColor(t.status) }]}>
                    <AppText size={11} weight="700" style={{ color: statusColor(t.status) }}>
                      {TICKET_STATUS_LABEL[t.status]}
                    </AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <AppText muted size={12} weight="600" style={{ marginLeft: 4 }}>
            START WITH A TOPIC
          </AppText>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {STUDENT_TOPICS.map((t, i) => (
              <Pressable
                key={t.category}
                onPress={() =>
                  router.push({ pathname: "/support-new", params: { category: t.category } })
                }
                style={({ pressed }) => [
                  styles.row,
                  i < STUDENT_TOPICS.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={t.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={colors.accent}
                />
                <AppText size={15} weight="500" style={{ flex: 1 }}>
                  {t.title}
                </AppText>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <AppText muted size={12} weight="600" style={{ marginLeft: 4 }}>
            MORE HELP
          </AppText>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Pressable
              onPress={() => router.push("/explore/guides")}
              style={({ pressed }) => [
                styles.row,
                { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="book-outline" size={20} color={colors.accent} />
              <AppText size={15} weight="500" style={{ flex: 1 }}>
                Campus guides
              </AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="mail-outline" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText size={15} weight="500">
                  Email support
                </AppText>
                <AppText muted size={12}>
                  {SUPPORT_EMAIL}
                </AppText>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.muted} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  choice: { borderRadius: radii.lg, padding: 20, gap: 8 },
  choiceHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  choiceIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  choiceCta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  card: { borderRadius: radii.md, overflow: "hidden" },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  status: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
