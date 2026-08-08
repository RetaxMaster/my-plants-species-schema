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

import { isNotAfterYmd, strictYmd } from './calendar-date.js';

describe('isNotAfterYmd — the PURE half of the future-date rule (spec §2.4)', () => {
  it('accepts a day before the reference, and the reference day itself', () => {
    expect(isNotAfterYmd('2026-08-07', '2026-08-08')).toBe(true);
    expect(isNotAfterYmd('2026-08-08', '2026-08-08')).toBe(true);
  });

  it('rejects a day after the reference — including the one-digit year typo this rule exists for', () => {
    expect(isNotAfterYmd('2026-08-09', '2026-08-08')).toBe(false);
    expect(isNotAfterYmd('2027-01-15', '2026-08-08')).toBe(false);
  });

  it('compares CHRONOLOGICALLY across month and year boundaries, not by digit count', () => {
    expect(isNotAfterYmd('2026-09-02', '2026-10-01')).toBe(true);
    expect(isNotAfterYmd('2026-12-31', '2027-01-01')).toBe(true);
    expect(isNotAfterYmd('2027-01-01', '2026-12-31')).toBe(false);
  });

  it('rejects an impossible or malformed date on either side rather than guessing', () => {
    expect(isNotAfterYmd('2026-02-31', '2026-08-08')).toBe(false);
    expect(isNotAfterYmd('2026-8-8', '2026-08-08')).toBe(false);
    expect(isNotAfterYmd('2026-08-07', 'not-a-date')).toBe(false);
  });

  // The LAYERING, asserted rather than assumed (spec §2.4): `strictYmd` validates EXISTENCE for every
  // caller — including `care.postpone`'s postponeToOn and moving's moveOn, which are future-by-design.
  // Plausibility is a SEPARATE, per-field rule, and this is the test that stops someone "fixing"
  // strictYmd to reject the future and silently breaking both.
  it('strictYmd still ACCEPTS a real future date — existence is not plausibility', () => {
    expect(strictYmd.safeParse('2099-01-15').success).toBe(true);
  });
});
