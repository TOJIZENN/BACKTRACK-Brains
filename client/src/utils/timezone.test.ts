import { describe, expect, it } from 'vitest';
import { formatDateTime, formatShortDateTime, timeZoneOffsetMs, toWallClock, zonedToUtcMs } from './timezone';

const T = Date.parse('2026-01-15T10:05:00Z');

describe('timezone utils', () => {
  it('IST is UTC+05:30', () => {
    expect(timeZoneOffsetMs(T, 'Asia/Kolkata')).toBe(5.5 * 3_600_000);
    expect(formatDateTime(T, 'Asia/Kolkata')).toBe('2026-01-15 15:35 IST');
    expect(formatShortDateTime(T, 'Asia/Kolkata')).toBe('01-15 15:35');
    expect(formatDateTime(T, 'UTC')).toBe('2026-01-15 10:05 UTC');
  });

  it('converts IST wall-clock input to UTC', () => {
    expect(zonedToUtcMs('2026-01-15', '15:35', 'Asia/Kolkata')).toBe(T);
    expect(zonedToUtcMs('2026-01-15', '03:00', 'Asia/Kolkata')).toBe(Date.parse('2026-01-14T21:30:00Z'));
    expect(zonedToUtcMs('', '10:00', 'Asia/Kolkata')).toBeNaN();
  });

  it('round-trips through wall clock, including across daylight saving', () => {
    for (const zone of ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York']) {
      for (const iso of ['2026-01-15T10:05:00Z', '2026-07-15T23:40:00Z', '2026-03-29T12:00:00Z']) {
        const ms = Date.parse(iso);
        const { date, time } = toWallClock(ms, zone);
        expect(zonedToUtcMs(date, time, zone)).toBe(ms);
      }
    }
  });

  it('reports the weekday in the zone', () => {
    // Friday 20:00 UTC = Saturday 01:30 IST
    expect(toWallClock(Date.parse('2026-01-16T20:00:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-01-17', time: '01:30', weekday: 6 });
  });
});
