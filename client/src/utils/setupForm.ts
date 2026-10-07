import type { Granularity } from '../types/market';
import type { SessionSetup } from '../types/session';
import type { SameCandleRule } from '../trading/types';
import { DEFAULT_TIME_ZONE, isKnownTimeZone, toWallClock, zonedToUtcMs } from './timezone';

export const MIN_RISK_PERCENT = 0.01;
export const MAX_RISK_PERCENT = 10;
const DAY_MS = 86_400_000;
// v2: date/time became zone-relative (default IST); older saved UTC values are not reused.
const STORAGE_KEY = 'backtrack.setup.v2';

/** Raw form values (strings straight from inputs). Date/time are wall-clock in `timeZone`. */
export interface SetupFormValues {
  instrument: string;
  granularity: Granularity;
  date: string;
  time: string;
  startingBalance: string;
  riskPercent: string;
  sameCandleRule: SameCandleRule;
  timeZone: string;
}

export type SetupFormErrors = Partial<Record<keyof SetupFormValues, string>>;

/** London open (08:00 UTC) expressed in IST, a sensible first replay. */
const DEFAULT_START_TIME = '13:30';

/** A recent weekday at the London open, a sensible first replay. */
export function defaultSetupValues(nowMs: number = Date.now(), timeZone: string = DEFAULT_TIME_ZONE): SetupFormValues {
  let dayMs = nowMs - 7 * DAY_MS;
  while ([0, 6].includes(toWallClock(dayMs, timeZone).weekday)) dayMs -= DAY_MS;
  return {
    instrument: 'XAU_USD',
    granularity: 'M5',
    date: toWallClock(dayMs, timeZone).date,
    time: DEFAULT_START_TIME,
    startingBalance: '10000',
    riskPercent: '1',
    sameCandleRule: 'SL_FIRST',
    timeZone,
  };
}

/** Local hours for random starts. 08:00–17:00 on a weekday is inside gold's trading week in every listed zone. */
const RANDOM_START_FIRST_HOUR = 8;
const RANDOM_START_HOURS = 9;

/** Random weekday within the last year, at a daytime hour in the chosen zone. */
export function randomStart(
  nowMs: number = Date.now(),
  timeZone: string = DEFAULT_TIME_ZONE,
  random: () => number = Math.random,
): { date: string; time: string } {
  const today = toWallClock(nowMs, timeZone).date;
  let dayMs = Date.parse(`${today}T00:00:00Z`) - (2 + Math.floor(random() * 365)) * DAY_MS;
  // Calendar weekday doesn't depend on the zone. Move a weekend pick back to the Friday (no retry loop).
  const weekday = new Date(dayMs).getUTCDay();
  if (weekday === 6) dayMs -= DAY_MS;
  if (weekday === 0) dayMs -= 2 * DAY_MS;
  const minute = Math.floor(random() * RANDOM_START_HOURS * 12) * 5;
  const hour = RANDOM_START_FIRST_HOUR + Math.floor(minute / 60);
  const time = `${String(hour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  return { date: new Date(dayMs).toISOString().slice(0, 10), time };
}

export function startMsFrom(date: string, time: string, timeZone: string = DEFAULT_TIME_ZONE): number {
  return zonedToUtcMs(date, time, timeZone);
}

export function validateSetup(
  values: SetupFormValues,
  nowMs: number = Date.now(),
): { setup: SessionSetup; errors: null } | { setup: null; errors: SetupFormErrors } {
  const errors: SetupFormErrors = {};
  const startMs = startMsFrom(values.date, values.time, values.timeZone);
  const balance = Number(values.startingBalance);
  const risk = Number(values.riskPercent);

  if (!values.date) errors.date = 'Choose a date.';
  if (!values.time) errors.time = 'Choose a start time.';
  if (values.date && values.time && Number.isNaN(startMs)) errors.date = 'Invalid date or time.';
  else if (startMs >= nowMs) errors.date = 'The start must be in the past.';
  if (!(balance > 0)) errors.startingBalance = 'Enter a balance greater than 0.';
  if (!(risk >= MIN_RISK_PERCENT && risk <= MAX_RISK_PERCENT)) {
    errors.riskPercent = `Risk must be between ${MIN_RISK_PERCENT}% and ${MAX_RISK_PERCENT}%.`;
  }

  if (Object.keys(errors).length > 0) return { setup: null, errors };
  return {
    errors: null,
    setup: {
      instrument: values.instrument,
      granularity: values.granularity,
      startMs,
      runStartMs: startMs,
      startingBalance: balance,
      riskPercent: risk,
      sameCandleRule: values.sameCandleRule,
      timeZone: values.timeZone,
    },
  };
}

export function loadSavedSetup(): SetupFormValues | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = { ...defaultSetupValues(), ...(JSON.parse(raw) as Partial<SetupFormValues>) };
    if (!isKnownTimeZone(saved.timeZone)) saved.timeZone = DEFAULT_TIME_ZONE;
    return saved;
  } catch {
    return null;
  }
}

export function saveSetup(values: SetupFormValues): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage unavailable (private mode etc.) — remembering the form is only a convenience.
  }
}
