import { describe, expect, it } from 'vitest';
import { defaultSetupValues, randomStart, validateSetup } from './setupForm';
import { toWallClock } from './timezone';

const NOW = Date.parse('2026-10-06T12:00:00Z');

describe('setup form time zones', () => {
  it('defaults to Kolkata time', () => {
    expect(defaultSetupValues(NOW).timeZone).toBe('Asia/Kolkata');
  });

  it('interprets the entered date/time in the chosen zone', () => {
    const values = { ...defaultSetupValues(NOW), date: '2026-09-15', time: '15:30' };
    const ist = validateSetup(values, NOW);
    expect(ist.setup?.startMs).toBe(Date.parse('2026-09-15T10:00:00Z'));
    const utc = validateSetup({ ...values, timeZone: 'UTC' }, NOW);
    expect(utc.setup?.startMs).toBe(Date.parse('2026-09-15T15:30:00Z'));
  });

  it('rejects a start that is in the future once converted from IST', () => {
    // 17:40 IST on 2026-10-06 = 12:10 UTC, after NOW
    expect(validateSetup({ ...defaultSetupValues(NOW), date: '2026-10-06', time: '17:40' }, NOW).errors?.date).toBeDefined();
  });

  it('random starts are weekdays in the chosen zone and inside the gold trading week', () => {
    for (const zone of ['Asia/Kolkata', 'UTC', 'America/New_York', 'Asia/Tokyo']) {
      for (let i = 0; i < 60; i++) {
        const { date, time } = randomStart(NOW, zone, () => ((i + 1) * 0.1371) % 1);
        expect([0, 6]).not.toContain(new Date(`${date}T00:00:00Z`).getUTCDay());
        const ms = validateSetup({ ...defaultSetupValues(NOW), timeZone: zone, date, time }, NOW).setup!.startMs;
        const utc = toWallClock(ms, 'UTC');
        const hour = Number(utc.time.slice(0, 2));
        const marketOpen =
          (utc.weekday >= 1 && utc.weekday <= 4) || (utc.weekday === 5 && hour < 21) || (utc.weekday === 0 && hour >= 22);
        expect(marketOpen, `${zone} ${date} ${time}`).toBe(true);
      }
    }
  });
});
