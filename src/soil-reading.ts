import { z } from 'zod';
import { strictYmd } from './calendar-date.js';
import { INSTRUMENT_IDS, READING_KINDS } from './soil-instrument-constants.js';

// The Zod layer over the instrument property table. Both enums are DERIVED from the Zod-free arrays, so the
// arrays stay the single source of truth and the vocabulary can never fork.
export const instrumentIdEnum = z.enum(INSTRUMENT_IDS);
export const readingKindEnum = z.enum(READING_KINDS);

/** What the owner decided AFTER taking the reading (spec §4.8). A verdict maps onto a path that already
 *  exists — a WATER postpone or the existing early-water DONE — never onto a new scheduling rule. */
export const READING_VERDICTS = ['NONE', 'POSTPONE', 'WATER_NOW'] as const;
export type ReadingVerdict = (typeof READING_VERDICTS)[number];
export const readingVerdictEnum = z.enum(READING_VERDICTS);

export const soilReadingCreateSchema = z
  .object({
    instrumentId: instrumentIdEnum,
    /** The RAW instrument value. It is normalised server-side by the instrument's own row; the engine never
     *  sees this number. */
    rawValue: z.number().finite(),
    measuredOn: strictYmd,
    verdict: readingVerdictEnum.default('NONE'),
    /** Required by, and ONLY by, a POSTPONE verdict. */
    postponeToOn: strictYmd.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.verdict === 'POSTPONE' && v.postponeToOn === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['postponeToOn'],
        message: 'postponeToOn is required when verdict is POSTPONE',
      });
    }
    if (v.verdict !== 'POSTPONE' && v.postponeToOn !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['postponeToOn'],
        message: 'postponeToOn is only meaningful for a POSTPONE verdict',
      });
    }
  });
export type SoilReadingCreate = z.infer<typeof soilReadingCreateSchema>;

/** The per-(plant, instrument) calibration. TWO anchors, because a dimensionless fraction needs two ends:
 *  this pot at container capacity, and this pot dry. A single anchor cannot produce a 0..1 fraction. */
export const instrumentCalibrationSchema = z
  .object({
    saturatedValue: z.number().finite(),
    dryValue: z.number().finite(),
  })
  .refine((v) => v.saturatedValue > v.dryValue, {
    path: ['saturatedValue'],
    message: 'saturatedValue must be strictly greater than dryValue',
  });
export type InstrumentCalibration = z.infer<typeof instrumentCalibrationSchema>;
