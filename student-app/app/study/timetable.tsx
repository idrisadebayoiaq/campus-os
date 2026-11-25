import { View } from "react-native";
import { AppText } from "@/src/components/ui";
import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { DAYS, type TimetableEntry } from "@/src/lib/study";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

function TimetableHero({ items }: { items: TimetableEntry[] }) {
  const colors = useTheme();
  const today = new Date().getDay();
  const todayCount = items.filter((t) => t.day_of_week === today).length;
  return (
    <View
      style={{
        backgroundColor: colors.heroBg,
        borderRadius: radii.xl,
        padding: 20,
        gap: 4,
      }}
    >
      <AppText size={13} style={{ color: colors.heroMuted }}>
        Today · {DAYS[today]}
      </AppText>
      <AppText size={22} weight="700" style={{ color: colors.heroFg }}>
        {todayCount === 0
          ? "No classes today"
          : `${todayCount} class${todayCount === 1 ? "" : "es"} today`}
      </AppText>
      <AppText size={13} style={{ color: colors.heroMuted }}>
        {items.length} total this week
      </AppText>
    </View>
  );
}

export default function TimetableScreen() {
  return (
    <CrudScreen<TimetableEntry>
      title="Timetable"
      subtitle="Weekly class schedule"
      table="timetable_entries"
      cacheKey={CACHE_KEYS.timetable}
      orderBy={{ column: "day_of_week", ascending: true }}
      fields={[
        { key: "course_code", label: "Course code", placeholder: "CSC 201", required: true },
        { key: "course_title", label: "Title", placeholder: "Data Structures" },
        {
          key: "day_of_week",
          label: "Day",
          type: "select",
          required: true,
          defaultValue: "1",
          options: DAYS.map((d, i) => ({ label: d, value: i })),
        },
        { key: "start_time", label: "Start", type: "time", required: true, placeholder: "08:00" },
        { key: "end_time", label: "End", type: "time", required: true, placeholder: "10:00" },
        { key: "venue", label: "Venue", placeholder: "LT 2" },
        { key: "lecturer", label: "Lecturer" },
      ]}
      addLabel="Add class"
      transformDraft={(d) => ({ ...d, course_code: String(d.course_code).toUpperCase() })}
      sortItems={(items) =>
        [...items].sort(
          (a, b) =>
            a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
        )
      }
      emptyTitle="No classes yet"
      emptyBody="Add your lectures to see your week at a glance."
      header={(items) => <TimetableHero items={items} />}
      renderItem={(t) => ({
        title: `${DAYS[t.day_of_week] ?? "?"} · ${t.course_code}`,
        subtitle: `${t.start_time}–${t.end_time}${t.venue ? ` · ${t.venue}` : ""}`,
        meta: [t.course_title, t.lecturer].filter(Boolean).join(" · "),
      })}
    />
  );
}
