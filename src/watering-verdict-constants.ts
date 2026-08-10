// The watering-verdict value sets, Zod-FREE (same pattern as photo-contract-constants.ts /
// soil-instrument-constants.ts). These are closed literal unions the API's watering-verdict engine COMPUTES
// and the web never sends — structurally the same case photo-contract-constants.ts already solved for the
// photo pipeline's server-computed state machine. Pulled into the shared package for the identical reason:
// so the API's `Recommendation`/`HoldBasis`/`UnavailableReason` and the web's `SoilReadingPreview` fields
// can never silently diverge. See `docs/care-engine.md` §7.20.9 and the preview endpoint's own doc-comments
// (`repos/my-plants-api/src/soil-readings/soil-readings.controller.ts`, `soil-readings.service.ts`).

/** Water this pot today, or hold until when — the read-only preview's headline answer. `UNAVAILABLE` means
 *  no honest fraction exists to compare against the target (see `UNAVAILABLE_REASONS` for why). */
export const RECOMMENDATIONS = ['WATER_NOW', 'HOLD', 'UNAVAILABLE'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** Set iff `recommendation === 'HOLD'` — WHY the hold date is what it is. `MEASURED_SLOPE` = a fitted
 *  drying rate produced it; `SHORT_RECHECK` = too few readings for a fit, so the app asks for a re-check
 *  after the minimum span a fit needs (`VERDICT_RECHECK_DAYS`). */
export const HOLD_BASES = ['MEASURED_SLOPE', 'SHORT_RECHECK'] as const;
export type HoldBasis = (typeof HOLD_BASES)[number];

/** Set iff `recommendation === 'UNAVAILABLE'`. `NEEDS_CALIBRATION` = the instrument requires anchors this
 *  pot lacks (the measuring modal resolves this before previewing, so it should be unreachable from the
 *  app, but the endpoint still answers honestly to any caller). `NOT_MEASURABLE` = any OTHER null wetness
 *  (a NaN raw value, a degenerate calibration span). */
export const UNAVAILABLE_REASONS = ['NEEDS_CALIBRATION', 'NOT_MEASURABLE'] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];
