import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { formatDateTime, type LocalMeta } from "@/src/lib/study";

type Exam = LocalMeta & {
  id: string;
  course_code: string;
  title?: string | null;
  starts_at: string;
  venue?: string | null;
  notes?: string | null;
};

export default function ExamsScreen() {
  return (
    <CrudScreen<Exam>
      title="Exams"
      subtitle="Dates, venues and notes"
      table="exam_entries"
      cacheKey={CACHE_KEYS.exams}
      orderBy={{ column: "starts_at", ascending: true }}
      fields={[
        { key: "course_code", label: "Course code", placeholder: "CSC 201", required: true },
        { key: "title", label: "Title", placeholder: "First semester exam" },
        { key: "starts_at", label: "Starts", type: "datetime", required: true },
        { key: "venue", label: "Venue" },
        { key: "notes", label: "Notes", type: "multiline" },
      ]}
      addLabel="Add exam"
      transformDraft={(d) => ({ ...d, course_code: String(d.course_code).toUpperCase() })}
      sortItems={(items) => [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))}
      emptyTitle="No exams scheduled"
      emptyBody="Add exam dates so nothing catches you off guard."
      renderItem={(e) => ({
        title: e.course_code,
        subtitle: formatDateTime(e.starts_at),
        meta: [e.title, e.venue].filter(Boolean).join(" · "),
      })}
    />
  );
}
