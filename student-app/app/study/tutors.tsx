import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import type { LocalMeta } from "@/src/lib/study";

type Tutor = LocalMeta & {
  id: string;
  name: string;
  subject?: string | null;
  contact?: string | null;
  rate?: string | null;
};

/** Local-only on mobile for now (no remote tutors table yet). */
export default function TutorsScreen() {
  return (
    <CrudScreen<Tutor>
      title="Tutors"
      subtitle="Saved on this device"
      table="study_tutors"
      remote={false}
      cacheKey={CACHE_KEYS.tutors}
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "subject", label: "Subject / course", placeholder: "MTH 101" },
        { key: "contact", label: "Phone or email" },
        { key: "rate", label: "Rate / notes", placeholder: "₦2,000 per session" },
      ]}
      addLabel="Add tutor"
      emptyTitle="No tutors saved"
      emptyBody="Save tutors you trust so you can reach them quickly."
      renderItem={(t) => ({
        title: t.name,
        subtitle: [t.subject, t.contact].filter(Boolean).join(" · "),
        meta: t.rate ?? undefined,
      })}
    />
  );
}
