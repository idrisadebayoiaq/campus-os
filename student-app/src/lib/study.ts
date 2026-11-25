import type { Ionicons } from "@expo/vector-icons";

export type StudyToolKey =
  | "courses"
  | "timetable"
  | "classes"
  | "assignments"
  | "exams"
  | "calendar"
  | "planner"
  | "cgpa"
  | "library"
  | "past-questions"
  | "flashcards"
  | "cbt"
  | "focus"
  | "ai"
  | "groups"
  | "tutors"
  | "insights";

export type StudyTool = {
  href: StudyToolKey;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Works fully from local cache (view + create) without network */
  offline: boolean;
};

export const STUDY_TOOLS: StudyTool[] = [
  { href: "courses", title: "Courses", body: "Track your modules and units", icon: "book-outline", offline: true },
  { href: "timetable", title: "Timetable", body: "Weekly class schedule", icon: "calendar-outline", offline: true },
  { href: "classes", title: "Classes", body: "Enrolled courses, live & join codes", icon: "school-outline", offline: false },
  { href: "assignments", title: "Assignments", body: "Tasks and due dates", icon: "checkbox-outline", offline: true },
  { href: "exams", title: "Exams", body: "Exam dates and venues", icon: "alarm-outline", offline: true },
  { href: "calendar", title: "Calendar", body: "Academic calendar events", icon: "today-outline", offline: true },
  { href: "planner", title: "Planner", body: "Plan revision blocks", icon: "list-outline", offline: true },
  { href: "cgpa", title: "CGPA", body: "Grades and standing", icon: "stats-chart-outline", offline: true },
  { href: "library", title: "Library", body: "Notes and study material", icon: "library-outline", offline: true },
  { href: "past-questions", title: "Past questions", body: "Save past question notes", icon: "document-text-outline", offline: true },
  { href: "flashcards", title: "Flashcards", body: "Decks and spaced recall", icon: "albums-outline", offline: true },
  { href: "cbt", title: "CBT practice", body: "Log practice attempts", icon: "clipboard-outline", offline: true },
  { href: "focus", title: "Focus timer", body: "25/5 pomodoro sessions", icon: "timer-outline", offline: true },
  { href: "ai", title: "AI Tutor", body: "Ask study questions", icon: "sparkles-outline", offline: false },
  { href: "groups", title: "Study groups", body: "Organise your circles", icon: "people-outline", offline: true },
  { href: "tutors", title: "Tutors", body: "Keep tutor contacts", icon: "school-outline", offline: true },
  { href: "insights", title: "Insights", body: "Study time and trends", icon: "analytics-outline", offline: true },
];

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Local-only rows carry a temporary id until synced. */
export type LocalMeta = { _pending?: boolean };

export type Course = LocalMeta & {
  id: string;
  user_id?: string;
  code: string;
  title: string;
  units: number | null;
  semester?: string | null;
  kind?: string | null;
  created_at?: string;
};

export type TimetableEntry = LocalMeta & {
  id: string;
  user_id?: string;
  course_code: string;
  course_title?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  venue?: string | null;
  lecturer?: string | null;
  created_at?: string;
};

export type GradeEntry = LocalMeta & {
  id: string;
  user_id?: string;
  course_code: string;
  course_title?: string | null;
  credit_units: number | null;
  grade: string;
  grade_point?: number | null;
  semester?: string | null;
  created_at?: string;
};

export type Assignment = LocalMeta & {
  id: string;
  user_id?: string;
  title: string;
  course_code?: string | null;
  description?: string | null;
  due_at?: string | null;
  priority?: string | null;
  is_done?: boolean | null;
  created_at?: string;
};

export type FlashcardDeck = LocalMeta & {
  id: string;
  user_id?: string;
  title: string;
  created_at?: string;
};

export type Flashcard = LocalMeta & {
  id: string;
  user_id?: string;
  deck_id: string;
  front: string;
  back: string;
  created_at?: string;
};

export type StudySession = LocalMeta & {
  id: string;
  user_id?: string;
  minutes: number;
  kind?: string | null;
  note?: string | null;
  created_at?: string;
};

export type LibraryItem = LocalMeta & {
  id: string;
  user_id?: string;
  title: string;
  kind?: string | null;
  content?: string | null;
  url?: string | null;
  created_at?: string;
};

/* ----- Grade maths (ported from student-website src/lib/study/ai.ts) ----- */

export const GRADE_POINTS_5: Record<string, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
  F: 0,
};

export function calcCgpa(
  grades: { credit_units: number | null; grade: string; grade_point?: number | null }[],
) {
  let points = 0;
  let credits = 0;
  for (const g of grades) {
    const gp =
      g.grade_point != null
        ? Number(g.grade_point)
        : GRADE_POINTS_5[g.grade.toUpperCase()];
    if (gp == null || Number.isNaN(gp)) continue;
    const units = Number(g.credit_units) || 0;
    points += gp * units;
    credits += units;
  }
  return {
    cgpa: credits ? points / credits : null,
    credits,
  };
}

export function targetNeeded(
  currentCgpa: number,
  currentCredits: number,
  targetCgpa: number,
  remainingCredits: number,
) {
  if (remainingCredits <= 0) return null;
  return (
    (targetCgpa * (currentCredits + remainingCredits) -
      currentCgpa * currentCredits) /
    remainingCredits
  );
}

export function finalNeeded(
  knownScore: number,
  knownWeight: number,
  targetOverall: number,
  finalWeight: number,
) {
  if (finalWeight <= 0) return null;
  return (targetOverall - knownScore * (knownWeight / 100)) / (finalWeight / 100);
}

export type TimetableRow = {
  id: string;
  course_code: string;
  course_title?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  venue?: string | null;
};

/** Next upcoming lecture from now, wrapping into the following week if needed. */
export function getNextClass(rows: TimetableRow[], now = new Date()) {
  if (!rows.length) return null;
  const nowDow = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const ranked = rows
    .map((row) => {
      let dayOffset = (row.day_of_week - nowDow + 7) % 7;
      const startMins = (() => {
        const [h, m] = String(row.start_time || "0:0").split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      })();
      if (dayOffset === 0 && startMins <= nowMins) dayOffset = 7;
      const totalMins = dayOffset * 24 * 60 + startMins - nowMins;
      return { row, totalMins, dayOffset };
    })
    .sort((a, b) => a.totalMins - b.totalMins);

  return ranked[0] || null;
}

export function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDate(iso)} · ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Parse "2026-12-01" or "2026-12-01 09:00" into an ISO string, or null. */
export function parseDateInput(value: string): string | null {
  const v = value.trim().replace(" ", "T");
  if (!v) return null;
  const d = new Date(v.length <= 10 ? `${v}T09:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
