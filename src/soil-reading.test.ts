import { describe, expect, it } from 'vitest';
import {
  instrumentIdEnum,
  readingKindEnum,
  soilReadingCreateSchema,
  instrumentCalibrationSchema,
  wateringRelationEnum,
  WATERING_RELATIONS,
} from './soil-reading.js';
import { INSTRUMENT_IDS, READING_KINDS } from './soil-instrument-constants.js';

describe('the Zod layer is DERIVED from the constant arrays (no fork)', () => {
  it('derives the instrument enum from INSTRUMENT_IDS', () => {
    expect(instrumentIdEnum.options).toEqual([...INSTRUMENT_IDS]);
  });

  it('derives the kind enum from READING_KINDS', () => {
    expect(readingKindEnum.options).toEqual([...READING_KINDS]);
  });

  it('derives the watering-relation enum from WATERING_RELATIONS', () => {
    expect(wateringRelationEnum.options).toEqual([...WATERING_RELATIONS]);
  });

  it('WATERING_RELATIONS is closed to exactly BEFORE and AFTER', () => {
    expect(WATERING_RELATIONS).toEqual(['BEFORE', 'AFTER']);
  });
});

describe('soilReadingCreateSchema', () => {
  const base = { instrumentId: 'galvanic-probe', rawValue: 6, measuredOn: '2026-08-08' } as const;

  it('accepts a well-formed reading with no verdict', () => {
    expect(soilReadingCreateSchema.parse({ ...base }).verdict).toBe('NONE');
  });

  it('rejects an unknown instrument', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, instrumentId: 'tensiometer' }).success).toBe(false);
  });

  it('rejects a non-finite raw value', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: Number.NaN }).success).toBe(false);
  });

  it('rejects a malformed calendar date (strictYmd, the shared existence check)', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, measuredOn: '2026-02-31' }).success).toBe(false);
  });

  it('REQUIRES postponeToOn when the verdict is POSTPONE, and refuses it otherwise', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, verdict: 'POSTPONE' }).success).toBe(false);
    expect(
      soilReadingCreateSchema.safeParse({ ...base, verdict: 'POSTPONE', postponeToOn: '2026-08-12' }).success,
    ).toBe(true);
    expect(
      soilReadingCreateSchema.safeParse({ ...base, verdict: 'WATER_NOW', postponeToOn: '2026-08-12' }).success,
    ).toBe(false);
  });

  describe('wateringRelation — the same-day-reading disambiguation (owner-ruled, 2026-08-08)', () => {
    it('is optional — absent means UNKNOWN, and the field is simply not present in the parsed output', () => {
      const parsed = soilReadingCreateSchema.parse({ ...base });
      expect(parsed.wateringRelation).toBeUndefined();
    });

    it('accepts BEFORE and AFTER', () => {
      expect(soilReadingCreateSchema.safeParse({ ...base, wateringRelation: 'BEFORE' }).success).toBe(true);
      expect(soilReadingCreateSchema.safeParse({ ...base, wateringRelation: 'AFTER' }).success).toBe(true);
    });

    it('rejects an unknown value — never silently coerced or dropped', () => {
      expect(
        soilReadingCreateSchema.safeParse({ ...base, wateringRelation: 'DURING' }).success,
      ).toBe(false);
    });
  });
});

describe('instrumentCalibrationSchema', () => {
  it('accepts two ordered anchors', () => {
    const p = instrumentCalibrationSchema.parse({ saturatedValue: 1850, dryValue: 1200 });
    expect(p).toEqual({ saturatedValue: 1850, dryValue: 1200 });
  });

  it('REFUSES a saturated anchor that is not above the dry one — a zero or negative span is not a scale', () => {
    expect(instrumentCalibrationSchema.safeParse({ saturatedValue: 1200, dryValue: 1200 }).success).toBe(false);
    expect(instrumentCalibrationSchema.safeParse({ saturatedValue: 900, dryValue: 1200 }).success).toBe(false);
  });
});
