import { describe, expect, it } from 'vitest';
import { isValidCalendarDate, strictYmd } from './calendar-date.js';

describe('isValidCalendarDate', () => {
  it('accepts ordinary calendar dates', () => {
    expect(isValidCalendarDate('2026-01-15')).toBe(true);
    expect(isValidCalendarDate('2026-02-28')).toBe(true);
  });

  it('accepts a real leap day', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
  });

  it('rejects a non-leap-year Feb 29', () => {
    expect(isValidCalendarDate('2025-02-29')).toBe(false);
  });

  it('rejects Feb 30 and Feb 31 (roll-forward cases)', () => {
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('2026-02-31')).toBe(false);
  });

  it('rejects Apr 31 (30-day month)', () => {
    expect(isValidCalendarDate('2026-04-31')).toBe(false);
  });

  it('rejects an out-of-range month', () => {
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('2026-00-01')).toBe(false);
  });

  it('rejects malformed shapes', () => {
    expect(isValidCalendarDate('2026-2-1')).toBe(false);
    expect(isValidCalendarDate('2026/02/01')).toBe(false);
    expect(isValidCalendarDate('not-a-date')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });
});

describe('strictYmd', () => {
  it('parses ordinary dates and real leap days', () => {
    expect(strictYmd.safeParse('2026-02-28').success).toBe(true);
    expect(strictYmd.safeParse('2024-02-29').success).toBe(true);
  });

  it('rejects impossible calendar dates', () => {
    expect(strictYmd.safeParse('2026-02-31').success).toBe(false);
    expect(strictYmd.safeParse('2026-04-31').success).toBe(false);
    expect(strictYmd.safeParse('2026-02-30').success).toBe(false);
    expect(strictYmd.safeParse('2025-02-29').success).toBe(false);
  });

  it('rejects a malformed shape before it ever reaches the calendar check', () => {
    const result = strictYmd.safeParse('2026/02/01');
    expect(result.success).toBe(false);
  });
});
