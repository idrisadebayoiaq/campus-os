import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import type { Course } from "@/src/lib/study";

export default function CoursesScreen() {
  return (
    <CrudScreen<Course>
      title="Courses"
      subtitle="Your modules this semester"
      table="student_courses"
      cacheKey={CACHE_KEYS.courses}
      fields={[
        { key: "code", label: "Course code", placeholder: "CSC 201", required: true },
        { key: "title", label: "Title", placeholder: "Data Structures", required: true },
        { key: "units", label: "Credit units", type: "number", placeholder: "3" },
        { key: "semester", label: "Semester", placeholder: "First" },
      ]}
      addLabel="Add course"
      transformDraft={(d) => ({ ...d, code: String(d.code).toUpperCase() })}
      emptyTitle="No courses yet"
      emptyBody="Add your courses to use them across timetable, grades and flashcards."
      renderItem={(c) => ({
        title: c.code,
        subtitle: c.title,
        meta: [c.units != null ? `${c.units} units` : null, c.semester].filter(Boolean).join(" · "),
      })}
    />
  );
}
