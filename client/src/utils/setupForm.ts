import type { Granularity } from '../types/market';
import type { SessionSetup } from '../types/session';
import type { SameCandleRule } from '../trading/types';

export const MIN_RISK_PERCENT = 0.01;
export const MAX_RISK_PERCENT = 10;
const DAY_MS = 86_400_000;
const STORAGE_KEY = 'backtrack.setup.v1';

/** Raw form values (strings straight from inputs). Date/time are UTC. */
export interface SetupFormValues {
  instrument: string;
  granularity: Granularity;
  date: string;
  time: string;
  startingBalance: string;
  riskPercent: string;
  sameCandleRule: SameCandleRule;
}

export type SetupFormErrors = Partial<Record<keyof SetupFormValues, string>>;

/** A recent weekday at the London open, a sensible first replay. */
export function defaultSetupValues(nowMs: number = Date.now()): SetupFormValues {
  let day = new Date(nowMs - 7 * DAY_MS);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() - DAY_MS);
  return {
    instrument: 'XAU_USD',
    granularity: 'M5',
    date: day.toISOString().slice(0, 10),
    time: '08:00',
    startingBalance: '10000',
    riskPercent: '1',
    sameCandleRule: 'SL_FIRST',
  };
}

/** Random weekday within the last year, during active hours. */
export function randomStart(nowMs: number = Date.now(), random: () => number = Math.random): { date: string; time: string } {
  let day: Date;
  do {
    day = new Date(nowMs - (2 + Math.floor(random() * 365)) * DAY_MS);
  } while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  const hour = 1 + Math.floor(random() * 19);
  const minute = Math.floor(random() * 12) * 5;
  return { date: day.toISOString().slice(0, 10), time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

export function startMsFrom(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00Z`);
}

export function validateSetup(
  values: SetupFormValues,
  nowMs: number = Date.now(),
): { setup: SessionSetup; errors: null } | { setup: null; errors: SetupFormErrors } {
  const errors: SetupFormErrors = {};
  const startMs = startMsFrom(values.date, values.time);
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
      startingBalance: balance,
      riskPercent: risk,
      sameCandleRule: values.sameCandleRule,
    },
  };
}

export function loadSavedSetup(): SetupFormValues | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultSetupValues(), ...(JSON.parse(raw) as Partial<SetupFormValues>) } : null;
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
