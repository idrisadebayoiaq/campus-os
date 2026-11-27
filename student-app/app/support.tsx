import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Group, ListRow, PageShell, Pill, Section, type Tone } from "@/src/components/page";
import { AppText } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { STUDENT_TOPICS, TICKET_STATUS_LABEL, loadMyTickets, type SupportTicketRow } from "@/src/lib/support";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const SUPPORT_EMAIL = "support@campusos.app";

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const TONE: Record<SupportTicketRow["status"], Tone> = {
  open: "neutral",
  waiting: "warn",
  resolved: "success",
};

export default function SupportScreen() {
  const { user } = useAuth();
  const colors = useTheme();
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

  const tile = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    sub: string,
    onPress: () => void,
    dark: boolean,
  ) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: dark ? colors.heroBg : colors.surface, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: dark ? colors.accent : colors.accentSoft }]}>
        <Ionicons name={icon} size={22} color={dark ? colors.onAccent : colors.fg} />
      </View>
      <AppText weight="700" size={16} style={{ color: dark ? colors.heroFg : colors.fg }}>
        {title}
      </AppText>
      <AppText size={12} style={{ color: dark ? colors.heroMuted : colors.muted }}>
        {sub}
      </AppText>
    </Pressable>
  );

  return (
    <PageShell title="Help & support">
      <View style={styles.tiles}>
        {tile("sparkles", "Ask assistant", "Instant · 24/7", () => router.push("/support-assistant"), true)}
        {tile("headset", "Talk to a person", "Open a ticket", () => router.push("/support-new"), false)}
      </View>

      {tickets.length ? (
        <Section title="Your tickets">
          <Group>
            {tickets.map((t) => (
              <ListRow
                key={t.id}
                icon="chatbubbles-outline"
                title={t.subject}
                subtitle={`#${t.number} · ${timeAgo(t.last_message_at)}`}
                right={<Pill label={TICKET_STATUS_LABEL[t.status]} tone={TONE[t.status] ?? "neutral"} />}
                onPress={() => router.push({ pathname: "/inbox/[id]", params: { id: t.conversation_id } })}
              />
            ))}
          </Group>
        </Section>
      ) : null}

      <Section title="Topics">
        <Group>
          {STUDENT_TOPICS.map((t) => (
            <ListRow
              key={t.category}
              icon={t.icon as keyof typeof Ionicons.glyphMap}
              title={t.title}
              onPress={() => router.push({ pathname: "/support-new", params: { category: t.category } })}
            />
          ))}
        </Group>
      </Section>

      <Section title="More">
        <Group>
          <ListRow icon="book-outline" title="Campus guides" onPress={() => router.push("/explore/guides")} />
          <ListRow icon="mail-outline" title="Email us" value={SUPPORT_EMAIL} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        </Group>
      </Section>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, borderRadius: radii.lg, padding: 16, gap: 4, minHeight: 140, justifyContent: "flex-end" },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: "auto" },
});
