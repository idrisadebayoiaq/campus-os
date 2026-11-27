import { Linking } from "react-native";
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

function contactLink(contact: string) {
  if (contact.includes("@")) return `mailto:${contact}`;
  const digits = contact.replace(/[^0-9+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/** Local-only on mobile for now (no remote tutors table yet). */
export default function TutorsScreen() {
  return (
    <CrudScreen<Tutor>
      title="Tutors"
      table="study_tutors"
      remote={false}
      cacheKey={CACHE_KEYS.tutors}
      icon="person-outline"
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "subject", label: "Course", placeholder: "MTH 101" },
        { key: "contact", label: "Phone or email" },
        { key: "rate", label: "Rate", placeholder: "₦2,000 / session" },
      ]}
      addLabel="Add tutor"
      emptyTitle="No tutors saved"
      searchText={(t) => `${t.name} ${t.subject ?? ""}`}
      renderItem={(t) => {
        const link = t.contact ? contactLink(t.contact) : null;
        return {
          title: t.name,
          subtitle: [t.subject, t.contact].filter(Boolean).join(" · ") || undefined,
          badge: t.rate ?? undefined,
          onPress: link ? () => void Linking.openURL(link) : undefined,
        };
      }}
      emptyBody="Save tutors you trust."
    />
  );
}
