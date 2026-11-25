import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { formatDateTime, type LocalMeta } from "@/src/lib/study";

type CbtAttempt = LocalMeta & {
  id: string;
  course_code?: string | null;
  total?: number | null;
  correct?: number | null;
  duration_seconds?: number | null;
  created_at?: string;
};

export default function CbtScreen() {
  return (
    <CrudScreen<CbtAttempt>
      title="CBT practice"
      subtitle="Log your practice attempts"
      table="cbt_attempts"
      cacheKey={CACHE_KEYS.cbt}
      fields={[
        { key: "course_code", label: "Course code", placeholder: "CSC 201", required: true },
        { key: "total", label: "Total questions", type: "number", required: true },
        { key: "correct", label: "Correct answers", type: "number", required: true },
        { key: "duration_minutes", label: "Time taken (minutes)", type: "number" },
      ]}
      addLabel="Log attempt"
      transformDraft={(d) => {
        const { duration_minutes, ...rest } = d;
        return {
          ...rest,
          course_code: String(d.course_code).toUpperCase(),
          duration_seconds: duration_minutes != null ? Math.round(Number(duration_minutes) * 60) : null,
        };
      }}
      emptyTitle="No attempts logged"
      emptyBody="Record scores from practice tests to track your progress."
      renderItem={(a) => {
        const pct =
          a.total && a.correct != null ? Math.round((a.correct / a.total) * 100) : null;
        return {
          title: `${a.course_code ?? "Practice"}${pct != null ? ` · ${pct}%` : ""}`,
          subtitle: `${a.correct ?? 0}/${a.total ?? 0} correct`,
          meta: [
            a.duration_seconds ? `${Math.round(a.duration_seconds / 60)} min` : null,
            formatDateTime(a.created_at),
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }}
    />
  );
}
