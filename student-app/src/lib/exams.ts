export const EXAMS = [
  { key: "jamb", label: "JAMB / UTME", blurb: "University and polytechnic entrance" },
  { key: "waec", label: "WAEC / WASSCE", blurb: "West African senior school certificate" },
  { key: "neco", label: "NECO", blurb: "National senior school certificate" },
  { key: "post_utme", label: "Post-UTME", blurb: "School screening after JAMB" },
  { key: "other", label: "Another exam", blurb: "GCE, IJMB, A-levels or similar" },
] as const;

export type ExamKey = (typeof EXAMS)[number]["key"];

export function examLabel(key: string) {
  return EXAMS.find((e) => e.key === key)?.label ?? key;
}

export const EXAM_SUBJECTS = [
  "English Language",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Further Mathematics",
  "Economics",
  "Government",
  "Literature in English",
  "Commerce",
  "Financial Accounting",
  "Geography",
  "Agricultural Science",
  "Christian Religious Studies",
  "Islamic Studies",
  "Civic Education",
  "Computer Studies",
  "History",
  "Yoruba",
  "Igbo",
  "Hausa",
];

/** Whole days from today until `iso` (YYYY-MM-DD). Negative once the date has passed. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function isIsoDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());
}
