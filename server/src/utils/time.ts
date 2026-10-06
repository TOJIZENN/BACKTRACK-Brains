export const MS_PER_SECOND = 1000;
export const MS_PER_DAY = 86_400_000;

export function startOfUtcDay(ms: number): number {
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
}

/** "YYYY-MM-DD" for the UTC day containing `ms` */
export function utcDayKey(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

/** Every UTC day start (ms) that overlaps [fromMs, toMs) */
export function utcDaysInRange(fromMs: number, toMs: number): number[] {
  const days: number[] = [];
  for (let day = startOfUtcDay(fromMs); day < toMs; day += MS_PER_DAY) days.push(day);
  return days;
}

/** ISO-8601 without milliseconds: "2026-01-15T10:05:00Z" */
export function toIsoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
