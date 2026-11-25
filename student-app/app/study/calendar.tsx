import { View } from "react-native";
import { AppText } from "@/src/components/ui";
import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { formatDate, type LocalMeta } from "@/src/lib/study";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type CalendarEvent = LocalMeta & {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
};

function CalendarHero({ items }: { items: CalendarEvent[] }) {
  const colors = useTheme();
  const now = Date.now();
  const upcoming = items
    .filter((e) => new Date(e.starts_at).getTime() >= now - 86400000)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
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
        Next up
      </AppText>
      <AppText size={20} weight="700" style={{ color: colors.heroFg }}>
        {upcoming ? upcoming.title : "No upcoming events"}
      </AppText>
      <AppText size={13} style={{ color: colors.heroMuted }}>
        {upcoming
          ? formatDate(upcoming.starts_at)
          : "Add semester dates, deadlines and breaks."}
      </AppText>
    </View>
  );
}

export default function CalendarScreen() {
  return (
    <CrudScreen<CalendarEvent>
      title="Calendar"
      subtitle="Academic calendar events"
      table="academic_calendar_events"
      cacheKey={CACHE_KEYS.calendar}
      orderBy={{ column: "starts_at", ascending: true }}
      fields={[
        { key: "title", label: "Event", placeholder: "Registration deadline", required: true },
        { key: "starts_at", label: "Starts", type: "date", required: true },
        { key: "ends_at", label: "Ends", type: "date" },
      ]}
      addLabel="Add event"
      transformDraft={(d) => ({ ...d, source: "student" })}
      sortItems={(items) => [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))}
      emptyTitle="No events yet"
      emptyBody="Add semester dates, deadlines and breaks."
      header={(items) => <CalendarHero items={items} />}
      renderItem={(e) => ({
        title: e.title,
        subtitle:
          formatDate(e.starts_at) + (e.ends_at ? ` → ${formatDate(e.ends_at)}` : ""),
      })}
    />
  );
}
