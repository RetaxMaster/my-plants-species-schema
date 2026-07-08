// The Zod layer of the WATER feedback-reason vocabulary. Imported from the package ROOT export by the API
// (which needs validation). The web imports only the Zod-free arrays via the ./feedback-reason-constants
// subpath, so Zod stays out of the client bundle. The enums here are DERIVED from the shared arrays
// (single source of truth) — never re-declare the vocabulary.
import { z } from 'zod';
import { EARLY_WATER_REASONS, WATER_POSTPONE_REASONS } from './feedback-reason-constants.js';

export const earlyWaterReasonEnum = z.enum(EARLY_WATER_REASONS);
export type EarlyWaterReasonEnum = z.infer<typeof earlyWaterReasonEnum>;

export const waterPostponeReasonEnum = z.enum(WATER_POSTPONE_REASONS);
export type WaterPostponeReasonEnum = z.infer<typeof waterPostponeReasonEnum>;
