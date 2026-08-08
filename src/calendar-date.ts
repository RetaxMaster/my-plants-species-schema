import { z } from 'zod';

// The shared civil-date shape. A regex alone accepts calendar-impossible strings like `2026-02-31`
// (JS Date silently rolls it forward to 2026-03-03) — see `isValidCalendarDate` below for the real check.
const YMD_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only when `value` is BOTH shaped like a calendar date AND names a date that actually exists.
 *
 * The trick is the round-trip: parse the y/m/d components, hand them to `Date.UTC` (which silently
 * NORMALIZES an out-of-range day/month — `Date.UTC(2026, 1, 31)` becomes March 3rd, `Date.UTC(2026, 12, 1)`
 * becomes January 2027), then render that normalized date back to a `YYYY-MM-DD` string. A real calendar
 * date round-trips to itself; an impossible one (Feb 31, Apr 31, Feb 30, a non-leap Feb 29, month 13, ...)
 * comes back different, and THAT mismatch is what we reject on — never a hand-maintained days-per-month
 * table, which is the same information `Date.UTC` already encodes correctly.
 */
export function isValidCalendarDate(value: string): boolean {
  if (!YMD_SHAPE.test(value)) return false;
  const [yStr, mStr, dStr] = value.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const rebuilt = new Date(Date.UTC(year, month - 1, day));
  const rendered = `${String(rebuilt.getUTCFullYear()).padStart(4, '0')}-${String(rebuilt.getUTCMonth() + 1).padStart(2, '0')}-${String(rebuilt.getUTCDate()).padStart(2, '0')}`;
  return rendered === value;
}

/**
 * The STRICT calendar-date schema. Use this everywhere a field is a civil date (an owner-visible day the
 * care engine anchors a clock to — substrate charge, structural degradation, the care journal) — NEVER for
 * an ISO instant. Rejects `2026-02-31`/`2026-04-31`/a non-leap `2026-02-29` the same way it accepts
 * `2026-02-28` and a real leap day like `2024-02-29`: see `isValidCalendarDate` for the mechanism.
 *
 * This is the single source or the strict validator — the api imports this rather than hand-copying the
 * check (no-new-forks rule): a second implementation is exactly how the two drift apart again.
 */
export const strictYmd = z
  .string()
  .regex(YMD_SHAPE, 'must be a YYYY-MM-DD calendar date')
  .refine(isValidCalendarDate, { message: 'must be a real calendar date (e.g. not 2026-02-31)' });

/**
 * True when `value` names a calendar day AT OR BEFORE `reference`.
 *
 * DELIBERATELY PURE AND CONTEXT-FREE (spec §2.4). This package cannot know which calendar day "today"
 * is for a given plant — that depends on the plant's place-city timezone, which only the API can
 * resolve. So the shared package exports the COMPARISON and nothing else; the API supplies the plant's
 * own local today and performs the check where plant context exists.
 *
 * It is NOT wired into `strictYmd`, and must never be: `care.postpone`'s `postponeToOn` and the moving
 * feature's `moveOn` are future-BY-DESIGN, and a rule placed in the shared validator would break both.
 * The rule is a per-FIELD refinement over the named class of PAST-EVENT dates, never a change to the
 * existence validators every caller shares.
 *
 * Zero-padded `YYYY-MM-DD` sorts lexicographically in chronological order, which is why a string
 * comparison is correct here and no Date is constructed — building Dates would reintroduce exactly the
 * timezone hazard this project bans. Both sides are validated first: a string that is not a real
 * calendar date is never "not after" anything (defence in depth — every call site has already run
 * `strictYmd` or `IsCalendarDate`).
 */
export function isNotAfterYmd(value: string, reference: string): boolean {
  if (!isValidCalendarDate(value) || !isValidCalendarDate(reference)) return false;
  return value <= reference;
}
