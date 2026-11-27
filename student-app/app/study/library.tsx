import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { type LibraryItem } from "@/src/lib/study";

const KIND_ICON = { note: "document-text-outline", summary: "reader-outline", link: "link-outline" } as const;

export default function LibraryScreen() {
  return (
    <CrudScreen<LibraryItem>
      title="Notes"
      table="study_library_items"
      cacheKey={CACHE_KEYS.notes}
      icon="document-text-outline"
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
      addLabel="New note"
      emptyTitle="No notes yet"
      emptyBody="Works offline."
      searchText={(n) => `${n.title} ${n.content ?? ""}`}
      renderItem={(n) => ({
        title: n.title,
        subtitle: n.content ? (n.content.length > 120 ? `${n.content.slice(0, 120)}…` : n.content) : (n.url ?? undefined),
        icon: KIND_ICON[(n.kind ?? "note") as keyof typeof KIND_ICON] ?? "document-text-outline",
        meta: n.kind ?? undefined,
      })}
    />
  );
}
