import { View } from "react-native";
import { AppText, Card } from "@/src/components/ui";
import { StudyShell, SyncBanner } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import {
  calcCgpa,
  type Assignment,
  type GradeEntry,
  type LocalMeta,
  type StudySession,
} from "@/src/lib/study";
import { useStudyTable } from "@/src/lib/use-study-table";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Cbt = LocalMeta & { id: string; total?: number | null; correct?: number | null };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card style={{ flexGrow: 1, width: "47%", gap: 4 }}>
      <AppText muted size={12}>
        {label}
      </AppText>
      <AppText size={26} weight="700">
        {value}
      </AppText>
      {hint ? (
        <AppText muted size={12}>
          {hint}
        </AppText>
      ) : null}
    </Card>
  );
}

export default function InsightsScreen() {
  const colors = useTheme();
  const sessions = useStudyTable<StudySession>({ table: "study_sessions", cacheKey: CACHE_KEYS.focus });
  const grades = useStudyTable<GradeEntry>({ table: "grade_entries", cacheKey: CACHE_KEYS.grades });
  const tasks = useStudyTable<Assignment>({ table: "academic_tasks", cacheKey: CACHE_KEYS.assignments });
  const cbt = useStudyTable<Cbt>({ table: "cbt_attempts", cacheKey: CACHE_KEYS.cbt });

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekMinutes = sessions.items
    .filter((s) => s.created_at && new Date(s.created_at).getTime() >= weekAgo)
    .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  const totalMinutes = sessions.items.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

  // Last 7 days bar chart
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    const minutes = sessions.items
      .filter((s) => s.created_at && new Date(s.created_at).toDateString() === d.toDateString())
      .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
    return { label: d.toLocaleDateString(undefined, { weekday: "narrow" }), minutes };
  });
  const maxMinutes = Math.max(30, ...days.map((d) => d.minutes));

  const { cgpa } = calcCgpa(grades.items);
  const done = tasks.items.filter((t) => t.is_done).length;
  const scored = cbt.items.filter((a) => a.total && a.correct != null);
  const avgCbt = scored.length
    ? Math.round(
        (scored.reduce((sum, a) => sum + (a.correct as number) / (a.total as number), 0) /
          scored.length) *
          100,
      )
    : null;

  const all = [sessions, grades, tasks, cbt];

  return (
    <StudyShell
      title="Insights"
      subtitle="Your study trends"
      refreshing={all.some((s) => s.refreshing)}
      onRefresh={() => all.forEach((s) => void s.refresh())}
      banner={
        <SyncBanner
          offline={all.some((s) => s.offline)}
          pending={all.reduce((n, s) => n + s.pendingCount, 0)}
        />
      }
    >
      <View style={{ backgroundColor: colors.heroBg, borderRadius: radii.xl, padding: 22, gap: 14 }}>
        <View>
          <AppText size={13} style={{ color: colors.heroMuted }}>
            Focus time this week
          </AppText>
          <AppText size={36} weight="700" style={{ color: colors.heroFg }}>
            {weekMinutes} min
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 80 }}>
          {days.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <View
                style={{
                  width: "100%",
                  height: Math.max(4, (d.minutes / maxMinutes) * 56),
                  borderRadius: 6,
                  backgroundColor: d.minutes ? colors.heroFg : "rgba(255,255,255,0.2)",
                }}
              />
              <AppText size={11} style={{ color: colors.heroMuted }}>
                {d.label}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Stat label="All-time focus" value={`${Math.round(totalMinutes / 60 * 10) / 10}h`} hint={`${sessions.items.length} sessions`} />
        <Stat label="CGPA" value={cgpa != null ? cgpa.toFixed(2) : "—"} hint={`${grades.items.length} graded courses`} />
        <Stat label="Tasks done" value={`${done}/${tasks.items.length}`} />
        <Stat label="CBT average" value={avgCbt != null ? `${avgCbt}%` : "—"} hint={`${scored.length} attempts`} />
      </View>
    </StudyShell>
  );
}
