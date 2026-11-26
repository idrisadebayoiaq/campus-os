import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AppText,
  Avatar,
  Screen,
  TAB_BAR_CLEARANCE,
} from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira, getStudentCampus } from "@/src/lib/campus";
import {
  DAYS,
  STUDY_TOOLS,
  calcCgpa,
  formatDate,
  getNextClass,
  type TimetableRow,
} from "@/src/lib/study";
import { getCached, scopedKey } from "@/src/lib/offline";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
};

type Deal = {
  id: string;
  title: string;
  special_price: number | null;
  business_id: string;
  business_profiles: { display_name: string } | { display_name: string }[] | null;
  menu_items: { name: string; price: number } | { name: string; price: number }[] | null;
};

type QuickAction = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
};

/** Large 4-up shortcuts under the hero cards (OPay-style). */
const PRIMARY_ACTIONS: QuickAction[] = [
  {
    key: "assignments",
    title: "Assignments",
    icon: "checkbox-outline",
    href: "/study/assignments",
  },
  {
    key: "classes",
    title: "Classes",
    icon: "school-outline",
    href: "/study/classes",
  },
  {
    key: "courses",
    title: "Courses",
    icon: "book-outline",
    href: "/study/courses",
  },
  {
    key: "cgpa",
    title: "CGPA",
    icon: "stats-chart-outline",
    href: "/study/cgpa",
  },
];

/** Smaller utility grid — exclude calendar/timetable (hero) and primary actions. */
const UTILITY_EXCLUDE = new Set([
  "calendar",
  "timetable",
  "assignments",
  "classes",
  "courses",
  "cgpa",
  "ai",
]);

const UTILITY_ACTIONS: QuickAction[] = [
  ...STUDY_TOOLS.filter((t) => !UTILITY_EXCLUDE.has(t.href)).map((t) => ({
    key: t.href,
    title: t.title,
    icon: t.icon,
    href: `/study/${t.href}` as Href,
  })),
  {
    key: "housing",
    title: "Housing",
    icon: "home-outline",
    href: "/(tabs)/housing",
  },
  {
    key: "market",
    title: "Market",
    icon: "storefront-outline",
    href: "/(tabs)/marketplace",
  },
  {
    key: "inbox",
    title: "Chat",
    icon: "chatbubbles-outline",
    href: "/(tabs)/inbox",
  },
  {
    key: "more",
    title: "More",
    icon: "grid-outline",
    href: "/(tabs)/study",
  },
];

function dayLabel(dayOffset: number, dayOfWeek: number) {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  return DAYS[dayOfWeek] ?? "";
}

function pickNextCalendarEvent(events: CalendarEvent[], now = new Date()) {
  const upcoming = events
    .filter((e) => {
      const t = new Date(e.starts_at).getTime();
      return !Number.isNaN(t) && t >= now.getTime() - 12 * 60 * 60 * 1000;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return upcoming[0] ?? events[0] ?? null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [name, setName] = useState("Student");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timetable, setTimetable] = useState<TimetableRow[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [cgpa, setCgpa] = useState<number | null>(null);
  const [credits, setCredits] = useState(0);
  const [courseCount, setCourseCount] = useState(0);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [deals, setDeals] = useState<Deal[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void (async () => {
        const campus = await getStudentCampus(supabase, user.id);
        if (!campus) return;
        const { data } = await supabase
          .from("promotions")
          .select(
            "id, title, special_price, business_id, business_profiles!inner(display_name, campus_id), menu_items(name, price)",
          )
          .eq("kind", "special")
          .eq("business_profiles.campus_id", campus.campusId)
          .limit(10);
        setDeals((data as unknown as Deal[]) ?? []);
      })();
    }, [user]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
        .then(({ count }) => setUnreadNotifications(count ?? 0));
    }, [user]),
  );

  const load = useCallback(async () => {
    if (!user) return;
    const [
      { data: profile },
      ttRes,
      gradesRes,
      coursesRes,
      tasksRes,
      calRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("preferred_name, first_name, full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("timetable_entries").select("*").eq("user_id", user.id),
      supabase
        .from("grade_entries")
        .select("credit_units, grade, grade_point")
        .eq("user_id", user.id),
      supabase
        .from("student_courses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("academic_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_done", false),
      supabase
        .from("academic_calendar_events")
        .select("id, title, starts_at, ends_at")
        .eq("user_id", user.id)
        .order("starts_at", { ascending: true }),
    ]);

    setName(
      profile?.preferred_name ||
        profile?.first_name ||
        profile?.full_name ||
        user.email?.split("@")[0] ||
        "Student",
    );
    setAvatarUrl(profile?.avatar_url ?? null);

    let rows = (ttRes.data as TimetableRow[]) || [];
    if (ttRes.error || !rows.length) {
      const cached = await getCached<TimetableRow[]>(
        scopedKey("study:timetable", user.id),
        [],
      );
      if (cached.length) rows = cached;
    }
    setTimetable(rows);

    let events = (calRes.data as CalendarEvent[]) || [];
    if (calRes.error || !events.length) {
      const cached = await getCached<CalendarEvent[]>(
        scopedKey("study:calendar", user.id),
        [],
      );
      if (cached.length) events = cached;
    }
    setCalendarEvents(events);

    const gradeRows = gradesRes.data || [];
    if (!gradesRes.error && gradeRows.length) {
      const calc = calcCgpa(gradeRows);
      setCgpa(calc.cgpa);
      setCredits(calc.credits);
    } else {
      const cachedGrades = await getCached<
        {
          credit_units: number | null;
          grade: string;
          grade_point?: number | null;
        }[]
      >(scopedKey("study:grades", user.id), []);
      const calc = calcCgpa(cachedGrades);
      setCgpa(calc.cgpa);
      setCredits(calc.credits);
    }

    setCourseCount(coursesRes.count ?? 0);
    setAssignmentCount(tasksRes.count ?? 0);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const next = useMemo(() => getNextClass(timetable), [timetable]);
  const nextEvent = useMemo(
    () => pickNextCalendarEvent(calendarEvents),
    [calendarEvents],
  );
  const hasTimetable = timetable.length > 0;

  return (
    <Screen padded={false} tabClearance>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_CLEARANCE + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.fg}
          />
        }
      >
        {/* Header — OPay-style greeting + actions */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.greeting}
            accessibilityLabel="Open profile"
          >
            <Avatar uri={avatarUrl} label={name} size={40} />
            <View style={{ flex: 1, gap: 1 }}>
              <AppText size={18} weight="700" numberOfLines={1}>
                Hi, {name.toUpperCase()}
              </AppText>
              <AppText muted size={12} numberOfLines={1}>
                CampusOS Student
              </AppText>
            </View>
          </Pressable>
          <View style={styles.headerActions}>
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
              accessibilityLabel={
                unreadNotifications
                  ? `Notifications, ${unreadNotifications} unread`
                  : "Notifications"
              }
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color={colors.fg}
              />
              {unreadNotifications ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.danger, borderColor: colors.bg },
                  ]}
                >
                  <AppText size={10} weight="700" style={{ color: "#fff", lineHeight: 12 }}>
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* 1) Primary card — Calendar */}
        <Pressable
          onPress={() => router.push("/study/calendar")}
          style={[styles.heroCard, { backgroundColor: colors.accent }]}
        >
          <View style={styles.heroTop}>
            <View
              style={[
                styles.heroBadge,
                { backgroundColor: "rgba(60,49,91,0.14)" },
              ]}
            >
              <Ionicons name="calendar" size={14} color={colors.onAccent} />
              <AppText
                size={11}
                weight="700"
                style={{ color: colors.onAccent }}
              >
                CALENDAR
              </AppText>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.onAccent}
            />
          </View>

          {nextEvent ? (
            <>
              <AppText
                size={22}
                weight="700"
                style={{ color: colors.onAccent }}
                numberOfLines={2}
              >
                {nextEvent.title}
              </AppText>
              <AppText
                size={13}
                style={{ color: colors.onAccent, opacity: 0.85 }}
              >
                {formatDate(nextEvent.starts_at)}
                {nextEvent.ends_at
                  ? ` → ${formatDate(nextEvent.ends_at)}`
                  : ""}
              </AppText>
            </>
          ) : (
            <>
              <AppText
                size={22}
                weight="700"
                style={{ color: colors.onAccent }}
              >
                Academic calendar
              </AppText>
              <AppText
                size={13}
                style={{ color: colors.onAccent, opacity: 0.85 }}
              >
                Add semester dates, deadlines and breaks
              </AppText>
            </>
          )}

          <View style={styles.heroFooter}>
            <AppText
              size={12}
              weight="600"
              style={{ color: colors.onAccent, opacity: 0.9 }}
            >
              {assignmentCount
                ? `${assignmentCount} open assignment${assignmentCount === 1 ? "" : "s"}`
                : "Tap to view or set up"}
            </AppText>
            <View
              style={[
                styles.heroPlus,
                { backgroundColor: colors.onAccent },
              ]}
            >
              <Ionicons name="add" size={18} color={colors.accent} />
            </View>
          </View>
        </Pressable>

        {/* 2) Slim card — next class from timetable */}
        <Pressable
          onPress={() => router.push("/study/timetable")}
          style={[styles.slimCard, { backgroundColor: colors.surface }]}
        >
          <View
            style={[styles.slimIcon, { backgroundColor: colors.soft }]}
          >
            <Ionicons name="time-outline" size={18} color={colors.fg} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText muted size={11} weight="600">
              NEXT CLASS
            </AppText>
            {next ? (
              <>
                <AppText weight="700" size={14} numberOfLines={1}>
                  {next.row.course_code}
                  {next.row.course_title
                    ? ` · ${next.row.course_title}`
                    : ""}
                </AppText>
                <AppText muted size={12} numberOfLines={1}>
                  {dayLabel(next.dayOffset, next.row.day_of_week)} ·{" "}
                  {next.row.start_time}
                  {next.row.end_time ? `–${next.row.end_time}` : ""}
                  {next.row.venue ? ` · ${next.row.venue}` : ""}
                </AppText>
              </>
            ) : (
              <AppText weight="600" size={13}>
                {hasTimetable
                  ? "No upcoming class — view full timetable"
                  : "Set up your timetable"}
              </AppText>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        {/* Progress strip — OPay “business / sales” style */}
        <Pressable
          onPress={() => router.push("/study/cgpa")}
          style={[styles.slimCard, { backgroundColor: colors.surface }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText muted size={11} weight="600">
              ACADEMIC STANDING
            </AppText>
            <AppText weight="600" size={13}>
              CGPA {cgpa != null ? cgpa.toFixed(2) : "—"}
              {" · "}
              {credits} units · {courseCount} courses
            </AppText>
          </View>
          <AppText muted size={12} weight="600">
            Details ›
          </AppText>
        </Pressable>

        {/* Large 4-column quick actions */}
        <View style={styles.primaryGrid}>
          {PRIMARY_ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => router.push(action.href)}
              style={({ pressed }) => [
                styles.primaryTile,
                {
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.primaryIcon,
                  { backgroundColor: colors.accentSoft },
                ]}
              >
                <Ionicons name={action.icon} size={22} color={colors.fg} />
              </View>
              <AppText weight="600" size={12} numberOfLines={1}>
                {action.title}
              </AppText>
            </Pressable>
          ))}
        </View>

        {/* Smaller utility icon grid */}
        <View style={styles.utilityGrid}>
          {UTILITY_ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => router.push(action.href)}
              style={({ pressed }) => [
                styles.utilityTile,
                { opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View
                style={[
                  styles.utilityIcon,
                  { backgroundColor: colors.surface },
                ]}
              >
                <Ionicons name={action.icon} size={20} color={colors.fg} />
              </View>
              <AppText size={11} weight="500" numberOfLines={1}>
                {action.title}
              </AppText>
            </Pressable>
          ))}
        </View>

        {deals.length ? (
          <View style={{ gap: 8 }}>
            <AppText weight="700" size={16} style={{ paddingHorizontal: 20 }}>
              Deals near you
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
              {deals.map((d) => {
                const biz = Array.isArray(d.business_profiles) ? d.business_profiles[0] : d.business_profiles;
                const item = Array.isArray(d.menu_items) ? d.menu_items[0] : d.menu_items;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => router.push(`/explore/business/${d.business_id}`)}
                    style={[styles.dealCard, { backgroundColor: colors.surface }]}
                  >
                    <AppText size={11} weight="700" muted>
                      TODAY'S SPECIAL
                    </AppText>
                    <AppText weight="700" size={14} numberOfLines={1}>
                      {item?.name ?? d.title}
                    </AppText>
                    <AppText size={12} muted numberOfLines={1}>
                      {biz?.display_name}
                    </AppText>
                    <AppText weight="700" size={14}>
                      {formatNaira(Number(d.special_price ?? 0))}
                      {item ? (
                        <AppText size={12} muted>
                          {"  "}
                          <AppText size={12} muted style={{ textDecorationLine: "line-through" }}>
                            {formatNaira(Number(item.price))}
                          </AppText>
                        </AppText>
                      ) : null}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Promo / task card — AI Study */}
        <Pressable
          onPress={() => router.push("/(tabs)/ai")}
          style={[styles.promoCard, { backgroundColor: colors.heroBg }]}
        >
          <View
            style={[
              styles.promoIcon,
              { backgroundColor: "rgba(255,255,255,0.14)" },
            ]}
          >
            <Ionicons name="sparkles" size={20} color={colors.heroFg} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight="700" size={15} style={{ color: colors.heroFg }}>
              AI Study
            </AppText>
            <AppText size={12} style={{ color: colors.heroMuted }}>
              Ask questions, get practice, study step-by-step
            </AppText>
          </View>
          <View
            style={[
              styles.claimBtn,
              { backgroundColor: colors.accent },
            ]}
          >
            <AppText size={12} weight="700" style={{ color: colors.onAccent }}>
              Open
            </AppText>
          </View>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 4 },
  header: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  greeting: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
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
  heroCard: {
    marginHorizontal: 20,
    borderRadius: radii.lg,
    padding: 18,
    gap: 8,
    minHeight: 148,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  heroFooter: {
    marginTop: "auto",
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroPlus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  slimCard: {
    marginHorizontal: 20,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
  },
  slimIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryGrid: {
    paddingHorizontal: 20,
    flexDirection: "row",
    gap: 10,
  },
  primaryTile: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 8,
  },
  primaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityGrid: {
    paddingHorizontal: 16,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  utilityTile: {
    width: "25%",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  utilityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  promoCard: {
    marginHorizontal: 20,
    borderRadius: radii.lg,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  promoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dealCard: { width: 170, borderRadius: radii.md, padding: 12, gap: 3 },
  claimBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
});
