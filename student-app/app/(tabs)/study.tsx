import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { AppText, Screen, TAB_BAR_CLEARANCE } from "@/src/components/ui";
import { useStudentKind } from "@/src/lib/student-kind";
import { STUDY_TOOLS, type StudyTool } from "@/src/lib/study";
import { useStudyLock } from "@/src/lib/study-lock";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

/** Tools that make sense before a student has a school. Courses, timetable, classes and CGPA wait for admission. */
const EXAM_TOOLS = new Set(["planner", "calendar", "library", "past-questions", "flashcards", "cbt", "focus", "ai", "groups", "tutors", "insights"]);

const QUICK: { href: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { href: "ai", label: "Tutor", icon: "sparkles" },
  { href: "focus", label: "Focus", icon: "timer" },
  { href: "library", label: "Notes", icon: "document-text" },
  { href: "planner", label: "Plan", icon: "calendar" },
];

const SECTIONS: { title: string; tools: string[] }[] = [
  { title: "School", tools: ["courses", "timetable", "classes", "assignments", "exams", "calendar", "cgpa"] },
  { title: "Practice", tools: ["flashcards", "cbt", "past-questions"] },
  { title: "More", tools: ["groups", "tutors", "insights"] },
];

const LABEL: Record<string, string> = { library: "Notes", planner: "Study plan", cbt: "CBT", "past-questions": "Past questions" };

export default function StudyScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { isExamPrep } = useStudentKind();
  const { lock } = useStudyLock();
  const allowed = (href: string) => (isExamPrep ? EXAM_TOOLS.has(href) : href !== "past-questions");
  const byHref = new Map<string, StudyTool>(STUDY_TOOLS.map((t) => [t.href, t]));
  const open = (href: string) => router.push(`/study/${href}` as Href);

  return (
    <Screen padded={false} tabClearance>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_CLEARANCE }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText size={28} weight="700" style={{ flex: 1 }}>
            Study
          </AppText>
          <Pressable
            onPress={() => router.push("/study-lock" as Href)}
            style={[styles.lockBtn, { backgroundColor: lock ? colors.accent : colors.surface }]}
            accessibilityLabel="Study lock"
          >
            <Ionicons name={lock ? "lock-closed" : "lock-open-outline"} size={18} color={lock ? colors.onAccent : colors.fg} />
            <AppText size={13} weight="700" style={{ color: lock ? colors.onAccent : colors.fg }}>
              {lock ? "Locked" : "Lock"}
            </AppText>
          </Pressable>
        </View>

        <View style={styles.quick}>
          {QUICK.filter((q) => allowed(q.href)).map((q, i) => (
            <Pressable
              key={q.href}
              onPress={() => open(q.href)}
              style={({ pressed }) => [
                styles.quickTile,
                { backgroundColor: i === 0 ? colors.heroBg : colors.surface, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.quickIcon, { backgroundColor: i === 0 ? colors.accent : colors.accentSoft }]}>
                <Ionicons name={q.icon} size={20} color={i === 0 ? colors.onAccent : colors.fg} />
              </View>
              <AppText weight="700" size={13} style={{ color: i === 0 ? colors.heroFg : colors.fg }}>
                {q.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        {SECTIONS.map((s) => {
          const tools = s.tools.filter(allowed).map((h) => byHref.get(h)).filter(Boolean) as StudyTool[];
          if (!tools.length) return null;
          return (
            <View key={s.title} style={{ gap: 10 }}>
              <AppText muted size={12} weight="700" style={{ marginLeft: 24 }}>
                {s.title.toUpperCase()}
              </AppText>
              <View style={[styles.grid, { backgroundColor: colors.surface }]}>
                {tools.map((t) => (
                  <Pressable key={t.href} onPress={() => open(t.href)} style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.6 : 1 }]}>
                    <View style={[styles.cellIcon, { backgroundColor: colors.bg }]}>
                      <Ionicons name={t.icon} size={22} color={colors.fg} />
                    </View>
                    <AppText size={12} weight="600" numberOfLines={1} style={{ textAlign: "center" }}>
                      {LABEL[t.href] ?? t.title}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 8 },
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  lockBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radii.pill },
  quick: { flexDirection: "row", gap: 10, paddingHorizontal: 20 },
  quickTile: { flex: 1, borderRadius: radii.lg, paddingVertical: 16, alignItems: "center", gap: 8 },
  quickIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  grid: { marginHorizontal: 20, borderRadius: radii.lg, flexDirection: "row", flexWrap: "wrap", paddingVertical: 8 },
  cell: { width: "25%", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 4 },
  cellIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
