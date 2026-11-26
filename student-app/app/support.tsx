import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { ensureSupportConversation, previewForMessage } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const SUPPORT_EMAIL = "support@campusos.app";

const TOPICS: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  draft: string;
}[] = [
  { title: "Housing or an agent", icon: "business-outline", draft: "I need help with a housing listing or agent: " },
  { title: "Food or marketplace order", icon: "bag-handle-outline", draft: "I need help with an order: " },
  { title: "Login or account", icon: "key-outline", draft: "I need help with my account: " },
  { title: "Student ID verification", icon: "shield-checkmark-outline", draft: "I need help verifying my student ID: " },
  { title: "Report a problem in the app", icon: "bug-outline", draft: "Something isn't working: " },
];

export default function SupportScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ text: string; at: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      void (async () => {
        const { data: parts } = await supabase
          .from("conversation_participants")
          .select("conversation_id, conversations!inner(kind)")
          .eq("user_id", user.id)
          .eq("conversations.kind", "support")
          .limit(1);
        const convId = parts?.[0]?.conversation_id as string | undefined;
        if (!convId) return;
        const { data: msg } = await supabase
          .from("messages")
          .select("body, message_type, created_at")
          .eq("conversation_id", convId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && msg) {
          setLast({ text: previewForMessage(msg) || "", at: msg.created_at as string });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user]),
  );

  async function openChat(draft?: string) {
    if (!user || opening) return;
    setOpening(true);
    setError(null);
    try {
      const id = await ensureSupportConversation(supabase, user.id);
      router.push(
        draft
          ? { pathname: "/inbox/[id]", params: { id, draft } }
          : { pathname: "/inbox/[id]", params: { id } },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open support chat.");
    } finally {
      setOpening(false);
    }
  }

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
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <View style={[styles.heroIcon, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
            <Ionicons name="headset" size={22} color={colors.accent} />
          </View>
          <AppText size={20} weight="700" style={{ color: colors.heroFg }}>
            How can we help?
          </AppText>
          <AppText size={13} style={{ color: colors.heroMuted }}>
            Chat with the CampusOS team. We usually reply within a day, and you’ll
            get a notification when we do.
          </AppText>
          {last ? (
            <View style={[styles.lastBox, { backgroundColor: "rgba(255,255,255,0.1)" }]}>
              <AppText size={12} style={{ color: colors.heroMuted }}>
                Last message · {new Date(last.at).toLocaleDateString()}
              </AppText>
              <AppText size={13} numberOfLines={2} style={{ color: colors.heroFg }}>
                {last.text}
              </AppText>
            </View>
          ) : null}
          <Pressable
            onPress={() => void openChat()}
            disabled={opening}
            style={({ pressed }) => [
              styles.heroBtn,
              { backgroundColor: colors.accent, opacity: pressed || opening ? 0.8 : 1 },
            ]}
          >
            {opening ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Ionicons name="chatbubbles" size={18} color={colors.onAccent} />
                <AppText weight="700" style={{ color: colors.onAccent }}>
                  {last ? "Continue chat" : "Chat with support"}
                </AppText>
              </>
            )}
          </Pressable>
          {error ? (
            <AppText size={13} style={{ color: colors.danger }}>
              {error}
            </AppText>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <AppText muted size={12} weight="600" style={{ marginLeft: 4 }}>
            START WITH A TOPIC
          </AppText>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {TOPICS.map((t, i) => (
              <Pressable
                key={t.title}
                onPress={() => void openChat(t.draft)}
                style={({ pressed }) => [
                  styles.row,
                  i < TOPICS.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name={t.icon} size={20} color={colors.accent} />
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
  hero: { borderRadius: radii.lg, padding: 20, gap: 10 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  lastBox: { borderRadius: 12, padding: 12, gap: 2 },
  heroBtn: {
    marginTop: 6,
    height: 50,
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  card: { borderRadius: radii.md, overflow: "hidden" },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
});
