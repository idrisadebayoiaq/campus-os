export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return as < be && bs < ae;
}

export type TimetableRow = {
  id: string;
  course_code: string;
  course_title: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  venue: string | null;
  course_id: string | null;
  lecturer: string | null;
};

/** Next upcoming lecture from now, wrapping into the following week if needed. */
export function getNextClass(rows: TimetableRow[], now = new Date()) {
  if (!rows.length) return null;
  const nowDow = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const ranked = rows
    .map((row) => {
      let dayOffset = (row.day_of_week - nowDow + 7) % 7;
      const startMins = timeToMinutes(row.start_time);
      if (dayOffset === 0 && startMins <= nowMins) dayOffset = 7;
      const totalMins = dayOffset * 24 * 60 + startMins - nowMins;
      return { row, totalMins, dayOffset };
    })
    .sort((a, b) => a.totalMins - b.totalMins);

  return ranked[0] || null;
}

export function findTimetableOverlaps(rows: TimetableRow[]) {
  const warnings: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.day_of_week !== b.day_of_week) continue;
      if (!timesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) continue;
      warnings.push(
        `${DAYS[a.day_of_week]}: ${a.course_code} (${a.start_time}–${a.end_time}) overlaps ${b.course_code} (${b.start_time}–${b.end_time})`,
      );
    }
  }
  return warnings;
}
