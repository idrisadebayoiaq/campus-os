import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CrudScreen } from "@/src/components/study";
import { AppText } from "@/src/components/ui";
import { CACHE_KEYS } from "@/src/lib/offline";
import { cancelLocal, scheduleLocal } from "@/src/lib/push";
import type { LocalMeta } from "@/src/lib/study";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type PlanBlock = LocalMeta & {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  kind?: string | null;
};

const KIND_ICON = { revision: "repeat-outline", reading: "book-outline", practice: "create-outline" } as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(today)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

const REMIND_MIN = 10;
let scheduled = new Set<string>();

/** Shows the next session and keeps a phone reminder 10 minutes before each upcoming one. */
function NextUp({ items }: { items: PlanBlock[] }) {
  const colors = useTheme();
  const now = Date.now();
  const upcoming = items
    .filter((b) => new Date(b.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const key = upcoming.map((b) => `${b.id}@${b.starts_at}`).join(",");
  useEffect(() => {
    const next = new Set<string>();
    for (const b of upcoming.slice(0, 20)) {
      const id = `plan-${b.id}`;
      next.add(id);
      const at = new Date(new Date(b.starts_at).getTime() - REMIND_MIN * 60000);
      void scheduleLocal(id, at, `${b.title} in ${REMIND_MIN} min`, `${clock(b.starts_at)} – ${clock(b.ends_at)}`, "/study/planner");
    }
    for (const id of scheduled) if (!next.has(id)) void cancelLocal(id);
    scheduled = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const b = upcoming[0];
  if (!b) return null;
  const live = new Date(b.starts_at).getTime() <= now;
  return (
    <View style={[styles.next, { backgroundColor: colors.heroBg }]}>
      <View style={[styles.nextIcon, { backgroundColor: colors.accent }]}>
        <Ionicons name={live ? "radio-button-on" : "time"} size={20} color={colors.onAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size={12} weight="600" style={{ color: colors.heroMuted }}>
          {live ? "HAPPENING NOW" : `NEXT · ${dayLabel(b.starts_at).toUpperCase()}`}
        </AppText>
        <AppText size={17} weight="700" style={{ color: colors.heroFg }} numberOfLines={1}>
          {b.title}
        </AppText>
        <AppText size={13} style={{ color: colors.heroMuted }}>
          {clock(b.starts_at)} – {clock(b.ends_at)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  next: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: radii.xl },
  nextIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});

export default function PlannerScreen() {
  return (
    <CrudScreen<PlanBlock>
      title="Study plan"
      table="study_plan_blocks"
      cacheKey={CACHE_KEYS.planner}
      orderBy={{ column: "starts_at", ascending: true }}
      icon="calendar-outline"
      fields={[
        { key: "title", label: "What will you study?", placeholder: "Revise chapter 4", required: true },
        { key: "starts_at", label: "Starts", type: "datetime", required: true },
        { key: "ends_at", label: "Ends", type: "datetime", required: true },
        {
          key: "kind",
          label: "Type",
          type: "select",
          defaultValue: "revision",
          options: [
            { label: "Revision", value: "revision" },
            { label: "Reading", value: "reading" },
            { label: "Practice", value: "practice" },
          ],
        },
      ]}
      addLabel="Plan a session"
      sortItems={(items) => [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))}
      groupBy={(b) => dayLabel(b.starts_at)}
      header={(items) => <NextUp items={items} />}
      emptyTitle="Nothing planned"
      emptyBody="Block out time before exams."
      renderItem={(b) => {
        const now = Date.now();
        const live = new Date(b.starts_at).getTime() <= now && new Date(b.ends_at).getTime() > now;
        const past = new Date(b.ends_at).getTime() <= now;
        return {
          title: b.title,
          subtitle: `${clock(b.starts_at)} – ${clock(b.ends_at)}`,
          icon: KIND_ICON[(b.kind ?? "revision") as keyof typeof KIND_ICON] ?? "calendar-outline",
          badge: live ? "Now" : past ? "Done" : undefined,
          badgeTone: live ? "warn" : "success",
          meta: b.kind ?? undefined,
        };
      }}
    />
  );
}
