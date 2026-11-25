import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { formatDateTime, type Assignment } from "@/src/lib/study";

export default function AssignmentsScreen() {
  return (
    <CrudScreen<Assignment>
      title="Assignments"
      subtitle="Tasks and due dates"
      table="academic_tasks"
      cacheKey={CACHE_KEYS.assignments}
      fields={[
        { key: "title", label: "Title", placeholder: "Chapter 3 problem set", required: true },
        { key: "course_code", label: "Course code", placeholder: "CSC 201" },
        { key: "due_at", label: "Due", type: "datetime" },
        {
          key: "priority",
          label: "Priority",
          type: "select",
          defaultValue: "medium",
          options: [
            { label: "Low", value: "low" },
            { label: "Medium", value: "medium" },
            { label: "High", value: "high" },
          ],
        },
        { key: "description", label: "Notes", type: "multiline" },
      ]}
      addLabel="Add assignment"
      transformDraft={(d) => ({
        ...d,
        course_code: d.course_code ? String(d.course_code).toUpperCase() : null,
        is_done: false,
      })}
      sortItems={(items) =>
        [...items].sort((a, b) => {
          if (!!a.is_done !== !!b.is_done) return a.is_done ? 1 : -1;
          return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
        })
      }
      emptyTitle="Nothing due"
      emptyBody="Add assignments and tick them off when done."
      renderItem={(a, api) => ({
        title: a.title,
        subtitle: [a.course_code, a.due_at ? `Due ${formatDateTime(a.due_at)}` : null]
          .filter(Boolean)
          .join(" · "),
        meta: a.priority ? `${a.priority} priority` : undefined,
        done: !!a.is_done,
        onPress: () => void api.update(a.id, { is_done: !a.is_done }),
      })}
    />
  );
}
