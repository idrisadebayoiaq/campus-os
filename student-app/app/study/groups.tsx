import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import type { LocalMeta } from "@/src/lib/study";

type Group = LocalMeta & {
  id: string;
  name: string;
  course_code?: string | null;
  meeting?: string | null;
  contact?: string | null;
};

/** Local-only on mobile for now (no remote groups table yet). */
export default function GroupsScreen() {
  return (
    <CrudScreen<Group>
      title="Study groups"
      subtitle="Saved on this device"
      table="study_groups"
      remote={false}
      cacheKey={CACHE_KEYS.groups}
      fields={[
        { key: "name", label: "Group name", placeholder: "CSC 201 revision", required: true },
        { key: "course_code", label: "Course code", placeholder: "CSC 201" },
        { key: "meeting", label: "When / where", placeholder: "Fridays 4pm, library" },
        { key: "contact", label: "Group chat / contact" },
      ]}
      addLabel="Add group"
      emptyTitle="No groups yet"
      emptyBody="Keep track of your study circles and when they meet."
      renderItem={(g) => ({
        title: g.name,
        subtitle: [g.course_code, g.meeting].filter(Boolean).join(" · "),
        meta: g.contact ?? undefined,
      })}
    />
  );
}
