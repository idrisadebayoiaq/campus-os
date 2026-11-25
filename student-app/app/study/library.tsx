import { View } from "react-native";
import { AppText } from "@/src/components/ui";
import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { type LibraryItem } from "@/src/lib/study";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

function LibraryHero({ count }: { count: number }) {
  const colors = useTheme();
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
        {count} saved item{count === 1 ? "" : "s"}
      </AppText>
      <AppText size={20} weight="700" style={{ color: colors.heroFg }}>
        Notes stay on this device
      </AppText>
      <AppText size={13} style={{ color: colors.heroMuted }}>
        Syncs automatically when you’re online.
      </AppText>
    </View>
  );
}

export default function LibraryScreen() {
  return (
    <CrudScreen<LibraryItem>
      title="Library"
      subtitle="Notes and study material"
      table="study_library_items"
      cacheKey={CACHE_KEYS.notes}
      fields={[
        { key: "title", label: "Title", placeholder: "Sorting algorithms", required: true },
        {
          key: "kind",
          label: "Type",
          type: "select",
          defaultValue: "note",
          options: [
            { label: "Note", value: "note" },
            { label: "Summary", value: "summary" },
            { label: "Link", value: "link" },
          ],
        },
        { key: "content", label: "Body", type: "multiline", placeholder: "Write your notes…" },
        { key: "url", label: "Link", placeholder: "https://…" },
      ]}
      addLabel="Add note"
      emptyTitle="Your library is empty"
      emptyBody="Save notes and links. They stay on this device and sync when online."
      header={(items) => <LibraryHero count={items.length} />}
      renderItem={(n) => ({
        title: n.title,
        subtitle: n.content
          ? n.content.length > 140
            ? `${n.content.slice(0, 140)}…`
            : n.content
          : (n.url ?? undefined),
        meta: n.kind ?? undefined,
      })}
    />
  );
}
