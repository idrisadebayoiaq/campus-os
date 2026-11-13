export const SETUP_STEPS = [
  { key: "profile", label: "Profile" },
  { key: "hours", label: "Hours" },
  { key: "contact", label: "Contact" },
  { key: "payment", label: "Payment" },
  { key: "review", label: "Review" },
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayKey = (typeof DAYS)[number];

export type HoursMap = Record<
  DayKey,
  { closed: boolean; open: string; close: string }
>;

export function defaultHours(): HoursMap {
  return {
    monday: { closed: false, open: "09:00", close: "18:00" },
    tuesday: { closed: false, open: "09:00", close: "18:00" },
    wednesday: { closed: false, open: "09:00", close: "18:00" },
    thursday: { closed: false, open: "09:00", close: "18:00" },
    friday: { closed: false, open: "09:00", close: "18:00" },
    saturday: { closed: false, open: "10:00", close: "16:00" },
    sunday: { closed: true, open: "10:00", close: "16:00" },
  };
}

export function formatHours(hours: unknown): string[] {
  if (!hours || typeof hours !== "object") return [];
  const map = hours as Partial<HoursMap>;
  return DAYS.map((day) => {
    const entry = map[day];
    if (!entry) return `${day}: —`;
    if (entry.closed) return `${day}: Closed`;
    return `${day}: ${entry.open} – ${entry.close}`;
  });
}
