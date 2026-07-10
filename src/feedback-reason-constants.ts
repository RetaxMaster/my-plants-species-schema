// Client-safe WATER feedback-reason vocabularies — Zod-FREE (no `import { z }`). The web imports these
// via the package subpath "@retaxmaster/my-plants-species-schema/feedback-reason-constants" so Zod never
// enters its client bundle. The Zod layer (`feedback-reason.ts`) DERIVES its enums from these arrays, so
// the arrays are the single source of truth (no fork). Slugs are lowercase kebab and persisted verbatim
// into CareEvent.payload; human labels are the web's i18n concern, not stored here.
//
// These reasons are WATER-ONLY: they are captured only on the WATER task's early-watering DONE and its
// Postpone (spec B §2/§3). Non-water tasks never carry a reason.

// Reason the owner watered BEFORE the task was due (an "early" DONE on WATER). Ordered unjustified →
// justified. `dry-soil` is the JUSTIFIED reason (the soil really was dry → the plant drinks faster →
// water sooner); `intuition` is recorded but must NOT move the cadence (fixes today's blind shortening).
export const EARLY_WATER_REASONS = ['intuition', 'dry-soil'] as const;
export type EarlyWaterReason = (typeof EARLY_WATER_REASONS)[number];

// Reason the owner postponed a due/overdue WATER task. `soil-still-moist` is the JUSTIFIED reason (the
// soil is still wet → the plant needs water less often → water later); `no-time`/`other` are recorded but
// must NOT move the cadence.
export const WATER_POSTPONE_REASONS = ['soil-still-moist', 'no-time', 'other'] as const;
export type WaterPostponeReason = (typeof WATER_POSTPONE_REASONS)[number];

// The union of every WATER feedback reason — the coarse allow-list the API DTO validates against with a
// single @IsIn(...). The service/learning does the FINE gating (which reason is justified for which kind).
export const WATER_FEEDBACK_REASONS = [
  ...EARLY_WATER_REASONS,
  ...WATER_POSTPONE_REASONS,
] as const;
export type WaterFeedbackReason = (typeof WATER_FEEDBACK_REASONS)[number];

// The ONLY two reasons that move the watering cadence (spec B §3.1/§3.2). Named so the API learning engine
// references them by name — never a re-typed string literal (fork-safe).
export const JUSTIFIED_EARLY_WATER_REASON = 'dry-soil' satisfies EarlyWaterReason;
export const JUSTIFIED_POSTPONE_REASON = 'soil-still-moist' satisfies WaterPostponeReason;

// ---- REPOT inspection reasons (spec F.3) --------------------------------------------------------------
// REPOT is an INSPECTION, not a scheduled action: the owner opens the pot, looks, and reports one of three
// real outcomes. These slugs are REPOT-ONLY (a WATER event never carries one, and vice versa). They are
// persisted verbatim into CareEvent.payload; human labels are the web's i18n concern.
//
//   not-needed-yet     JUSTIFIED   — "I looked; the roots are fine."  (engine was early → lengthen cadence)
//   needed-cannot-now  JUSTIFIED   — "I looked; it IS root-bound, but I can't repot today." (→ shorten)
//   could-not-check    UNJUSTIFIED — "I did not look." (logistics, not information → moves nothing)
export const REPOT_POSTPONE_REASONS = ['not-needed-yet', 'needed-cannot-now', 'could-not-check'] as const;
export type RepotPostponeReason = (typeof REPOT_POSTPONE_REASONS)[number];

// The two reasons that carry ground truth and may move the schedule (spec F.3/F.6). Named so the API
// engine references them by name — never a re-typed literal (fork-safe).
export const JUSTIFIED_REPOT_REASONS = ['not-needed-yet', 'needed-cannot-now'] as const satisfies
  readonly RepotPostponeReason[];
// The one reason that is pure logistics and must never move the cadence (the F1.2 fix's justification gate).
export const UNJUSTIFIED_REPOT_REASON = 'could-not-check' satisfies RepotPostponeReason;
