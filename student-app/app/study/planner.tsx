import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { formatDateTime, type LocalMeta } from "@/src/lib/study";

type PlanBlock = LocalMeta & {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  kind?: string | null;
};

export default function PlannerScreen() {
  return (
    <CrudScreen<PlanBlock>
      title="Planner"
      subtitle="Plan revision and study blocks"
      table="study_plan_blocks"
      cacheKey={CACHE_KEYS.planner}
      orderBy={{ column: "starts_at", ascending: true }}
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
      addLabel="Add block"
      sortItems={(items) => [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))}
      emptyTitle="Nothing planned"
      emptyBody="Block out time for revision before exams."
      renderItem={(b) => ({
        title: b.title,
        subtitle: `${formatDateTime(b.starts_at)} → ${formatDateTime(b.ends_at)}`,
        meta: b.kind ?? undefined,
      })}
    />
  );
}
