import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { PREMIUM_GREEN } from "@/src/components/premium-badge";
import { AppText, Avatar, Screen, TAB_BAR_CLEARANCE } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { daysUntil, examLabel } from "@/src/lib/exams";
import { usePremium } from "@/src/lib/premium-state";
import { useStudentKind } from "@/src/lib/student-kind";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Tool = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  premium?: boolean;
};

const TOOLS: Tool[] = [
  { key: "ai", title: "AI tutor", icon: "sparkles-outline", href: "/study/ai", premium: true },
  { key: "pq", title: "Past questions", icon: "document-text-outline", href: "/study/past-questions", premium: true },
  { key: "cards", title: "Flashcards", icon: "albums-outline", href: "/study/flashcards" },
  { key: "cbt", title: "CBT practice", icon: "clipboard-outline", href: "/study/cbt" },
  { key: "plan", title: "Study plan", icon: "list-outline", href: "/study/planner" },
  { key: "focus", title: "Focus timer", icon: "timer-outline", href: "/study/focus" },
  { key: "notes", title: "Notes", icon: "library-outline", href: "/study/library" },
  { key: "groups", title: "Study groups", icon: "people-outline", href: "/study/groups" },
  { key: "tutors", title: "Tutors", icon: "school-outline", href: "/study/tutors" },
  { key: "insights", title: "Insights", icon: "analytics-outline", href: "/study/insights" },
  { key: "market", title: "Market", icon: "storefront-outline", href: "/(tabs)/marketplace" },
  { key: "chat", title: "Chat", icon: "chatbubbles-outline", href: "/(tabs)/inbox" },
];

/** Home screen for students who are preparing for JAMB, WAEC, NECO or a similar exam. */
export function ExamHome() {
  const { user } = useAuth();
  const colors = useTheme();
  const { goals, refresh: refreshKind } = useStudentKind();
  const premium = usePremium();
  const [name, setName] = useState("Student");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [p, w, n, t] = await Promise.all([
      supabase.from("profiles").select("preferred_name, first_name, full_name, avatar_url").eq("id", user.id).maybeSingle(),
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
      supabase.from("academic_tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_done", false),
    ]);
    setName(p.data?.preferred_name || p.data?.first_name || p.data?.full_name || user.email?.split("@")[0] || "Student");
    setAvatarUrl(p.data?.avatar_url ?? null);
    setWallet(Number(w.data?.balance ?? 0));
    setUnread(n.count ?? 0);
    setOpenTasks(t.count ?? 0);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refreshKind();
    }, [refreshKind]),
  );

  const days = daysUntil(goals.date);
  const examNames = goals.exams.map(examLabel).join(" · ");
  const needsSetup = goals.subjects.length === 0 || !goals.date;

  return (
    <Screen padded={false} tabClearance>
      <ScrollView
        contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: TAB_BAR_CLEARANCE + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
              void premium.refresh();
              void refreshKind();
            }}
            tintColor={colors.fg}
          />
        }
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/(tabs)/profile")} style={styles.greeting} accessibilityLabel="Open profile">
            <Avatar uri={avatarUrl} label={name} size={40} />
            <View style={{ flex: 1, gap: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AppText size={18} weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>
                  Hi, {name}
                </AppText>
              </View>
              <AppText muted size={12} numberOfLines={1}>
                Exam prep
              </AppText>
            </View>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => router.push("/support")}
              style={[styles.iconBtn, { backgroundColor: colors.surface }]}
              accessibilityLabel="Help"
            >
              <Ionicons name="headset-outline" size={18} color={colors.fg} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/notifications")}
              style={[styles.iconBtn, { backgroundColor: colors.surface }]}
              accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
            >
              <Ionicons name="notifications-outline" size={18} color={colors.fg} />
              {unread ? (
                <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.bg }]}>
                  <AppText size={10} weight="700" style={{ color: "#fff", lineHeight: 12 }}>
                    {unread > 9 ? "9+" : unread}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* Countdown */}
        <Pressable
          onPress={() => router.push("/exam-goals")}
          style={[styles.hero, { backgroundColor: colors.accent }]}
          accessibilityLabel="Edit exam goals"
        >
          <View style={styles.heroTop}>
            <View style={[styles.heroBadge, { backgroundColor: "rgba(60,49,91,0.14)" }]}>
              <Ionicons name="flag" size={14} color={colors.onAccent} />
              <AppText size={11} weight="700" style={{ color: colors.onAccent }}>
                {examNames ? examNames.toUpperCase() : "YOUR EXAM"}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onAccent} />
          </View>
          {days != null ? (
            days >= 0 ? (
              <>
                <AppText size={44} weight="700" style={{ color: colors.onAccent }}>
                  {days}
                  <AppText size={16} weight="600" style={{ color: colors.onAccent }}>
                    {days === 1 ? " day to go" : " days to go"}
                  </AppText>
                </AppText>
                <AppText size={13} style={{ color: colors.onAccent, opacity: 0.85 }}>
                  {days === 0 ? "Your exam is today. You've got this." : "Little and often beats last-minute cramming."}
                </AppText>
              </>
            ) : (
              <>
                <AppText size={22} weight="700" style={{ color: colors.onAccent }}>
                  Exam date has passed
                </AppText>
                <AppText size={13} style={{ color: colors.onAccent, opacity: 0.85 }}>
                  Tap to set your next exam date.
                </AppText>
              </>
            )
          ) : (
            <>
              <AppText size={22} weight="700" style={{ color: colors.onAccent }}>
                Set your exam date
              </AppText>
              <AppText size={13} style={{ color: colors.onAccent, opacity: 0.85 }}>
                Add your date and subjects to get a countdown and a study plan.
              </AppText>
            </>
          )}
          <AppText size={12} weight="600" style={{ color: colors.onAccent, opacity: 0.9, marginTop: "auto" }}>
            {goals.subjects.length
              ? `${goals.subjects.length} subject${goals.subjects.length === 1 ? "" : "s"}`
              : "No subjects yet"}
            {openTasks ? ` · ${openTasks} open task${openTasks === 1 ? "" : "s"}` : ""}
          </AppText>
        </Pressable>

        {needsSetup ? (
          <Pressable
            onPress={() => router.push("/exam-goals")}
            style={[styles.slim, { backgroundColor: colors.surface }]}
          >
            <View style={[styles.slimIcon, { backgroundColor: colors.soft }]}>
              <Ionicons name="create-outline" size={18} color={colors.fg} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <AppText weight="700" size={14}>
                Finish your exam goals
              </AppText>
              <AppText muted size={12}>
                Pick your subjects and exam date. Takes a minute.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        {!premium.active && !premium.loading ? (
          <Pressable
            onPress={() => router.push("/premium")}
            style={[styles.slim, { backgroundColor: colors.heroBg }]}
            accessibilityLabel="Get Premium"
          >
            <View style={[styles.slimIcon, { backgroundColor: PREMIUM_GREEN }]}>
              <Ionicons name="lock-open-outline" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <AppText weight="700" size={14} style={{ color: colors.heroFg }}>
                Unlock the AI tutor and past questions
              </AppText>
              <AppText size={12} style={{ color: colors.heroMuted }}>
                {formatNaira(premium.price)} a month. Everything else is free.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.heroMuted} />
          </Pressable>
        ) : null}

        <Pressable onPress={() => router.push("/wallet")} style={[styles.slim, { backgroundColor: colors.surface, minHeight: 56 }]}>
          <View style={[styles.slimIcon, { backgroundColor: colors.soft }]}>
            <Ionicons name="wallet-outline" size={18} color={colors.fg} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <AppText muted size={11} weight="600">
              WALLET BALANCE
            </AppText>
            <AppText weight="700" size={18}>
              {wallet == null ? "—" : formatNaira(wallet)}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <AppText weight="700" size={16} style={{ paddingHorizontal: 20, marginTop: 4 }}>
          Study tools
        </AppText>
        <View style={styles.grid}>
          {TOOLS.map((t) => {
            const locked = Boolean(t.premium) && !premium.active && !premium.loading;
            return (
              <Pressable
                key={t.key}
                onPress={() => router.push(t.href)}
                style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.75 : 1 }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: colors.surface }]}>
                  <Ionicons name={t.icon} size={22} color={colors.fg} />
                  {locked ? (
                    <View style={[styles.lock, { backgroundColor: PREMIUM_GREEN, borderColor: colors.bg }]}>
                      <Ionicons name="lock-closed" size={9} color="#fff" />
                    </View>
                  ) : null}
                </View>
                <AppText size={11} weight="500" numberOfLines={1}>
                  {t.title}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push("/exam-goals")}
          style={[styles.slim, { backgroundColor: colors.surface }]}
        >
          <View style={[styles.slimIcon, { backgroundColor: colors.soft }]}>
            <Ionicons name="school-outline" size={18} color={colors.fg} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <AppText weight="700" size={14}>
              Got admitted?
            </AppText>
            <AppText muted size={12}>
              Switch to a school account for courses, timetable and CGPA.
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10 },
  greeting: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { marginHorizontal: 20, borderRadius: radii.lg, padding: 18, gap: 6, minHeight: 168 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    maxWidth: "85%",
  },
  slim: {
    marginHorizontal: 20,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
  },
  slimIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  grid: { paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap" },
  tile: { width: "25%", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4 },
  tileIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  lock: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
