/**
 * Display time zones. Everything internal (API, engines, trades) stays in UTC; only what the user
 * sees and types is converted. Default: India Standard Time (UTC+05:30, no daylight saving).
 */

export interface TimeZoneOption {
  /** IANA zone id */
  id: string;
  /** Short label shown next to times, e.g. "IST" */
  short: string;
  label: string;
}

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export const TIME_ZONES: TimeZoneOption[] = [
  { id: 'Asia/Kolkata', short: 'IST', label: 'Kolkata — IST (UTC+05:30)' },
  { id: 'UTC', short: 'UTC', label: 'UTC' },
  { id: 'Europe/London', short: 'London', label: 'London (UTC+00:00 / +01:00)' },
  { id: 'America/New_York', short: 'New York', label: 'New York (UTC−05:00 / −04:00)' },
  { id: 'Asia/Dubai', short: 'Dubai', label: 'Dubai (UTC+04:00)' },
  { id: 'Asia/Singapore', short: 'SGT', label: 'Singapore (UTC+08:00)' },
  { id: 'Asia/Tokyo', short: 'JST', label: 'Tokyo (UTC+09:00)' },
];

export function timeZoneShort(id: string): string {
  return TIME_ZONES.find((z) => z.id === id)?.short ?? id;
}

export function isKnownTimeZone(id: unknown): id is string {
  return typeof id === 'string' && TIME_ZONES.some((z) => z.id === id);
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

export interface WallClock {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
  /** 0 = Sunday … 6 = Saturday, in the zone */
  weekday: number;
}

/** Wall-clock date/time of a UTC instant in `timeZone`. */
export function toWallClock(ms: number, timeZone: string): WallClock {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour}:${p.minute}`, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

/** Offset of `timeZone` from UTC at instant `ms`, in milliseconds (IST → +19 800 000). */
export function timeZoneOffsetMs(ms: number, timeZone: string): number {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant for a wall-clock "YYYY-MM-DD" + "HH:MM" in `timeZone`. NaN when the input is invalid. */
export function zonedToUtcMs(date: string, time: string, timeZone: string): number {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return Number.NaN;
  const first = naive - timeZoneOffsetMs(naive, timeZone);
  // Second pass corrects instants near a daylight-saving transition.
  return naive - timeZoneOffsetMs(first, timeZone);
}

/** "2026-01-15 15:35 IST" */
export function formatDateTime(input: number | string, timeZone: string): string {
  const { date, time } = toWallClock(new Date(input).getTime(), timeZone);
  return `${date} ${time} ${timeZoneShort(timeZone)}`;
}

/** "01-15 15:35" — compact form for dense tables (the column header names the zone). */
export function formatShortDateTime(input: number | string, timeZone: string): string {
  const { date, time } = toWallClock(new Date(input).getTime(), timeZone);
  return `${date.slice(5)} ${time}`;
}
