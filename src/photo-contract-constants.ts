// The photo-processing contract value sets, Zod-FREE (same pattern as image-limits.ts /
// plant-profile-constants.ts). These are the SINGLE source of truth for the per-photo state machine that
// both the API (Prisma enums / response typing) and the web (TS unions, verified by a parity test) share,
// so the two lists can never silently diverge. See spec §3.1, §4.5, §5.2, §6.3.

// The photo lifecycle. RECOVERING is stale-claim recovery's intermediate state (spec §4.5); the web treats
// it identically to PROCESSING and never needs its own UI.
export const PHOTO_STATUSES = ['PENDING', 'PROCESSING', 'RECOVERING', 'READY', 'FAILED'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

// Whether a FAILED photo may be retried. `transient` = the environment failed (retry may help);
// `permanent` = the image itself is the problem (retry re-runs the identical failure).
export const PHOTO_FAILURE_KINDS = ['transient', 'permanent'] as const;
export type PhotoFailureKind = (typeof PHOTO_FAILURE_KINDS)[number];

// The closed union surfaced on a FAILED photo so the web can show a SPECIFIC message. Ordered:
// the permanent image faults (the ImageErrorCode set), then inbox_lost (missing/unreadable staged bytes),
// then upload_failed (an exhausted transient failure: R2 unreachable, SDK/network, or an unexpected throw).
export const PHOTO_FAILURE_CODES = [
  'image_decode_failed',
  'image_unsupported_format',
  'image_animated',
  'image_too_large',
  'inbox_lost',
  'upload_failed',
] as const;
export type PhotoFailureCode = (typeof PHOTO_FAILURE_CODES)[number];
