import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  parseSpeciesRecord,
  primaryCommonName,
  safeParseSpeciesRecord,
  speciesRecordSchema,
} from './species-record.js';
import { GROWTH_HABITS } from './plant-profile-constants.js';

// Use the schema's INPUT type so fields that carry a `.default(...)` (e.g. `misting`,
// `watering.humiditySensitivity`) may be omitted from the fixture — that is exactly what the
// backward-compatibility assertions exercise.
const validRecord: z.input<typeof speciesRecordSchema> = {
  scientificName: 'Monstera deliciosa',
  commonNamesEn: ['Swiss cheese plant'],
  commonNamesEs: ['Costilla de Adán'],
  watering: {
    baseIntervalDays: 7,
    soilDrynessBeforeWatering: 'half-dry',
    droughtTolerance: 'medium',
    temperatureSensitivity: 'high',
    lightSensitivity: 'medium',
    humiditySensitivity: 'medium',
    reduceInDormancy: true,
  },
  light: { minimum: 'medium', ideal: 'bright-indirect', maximum: 'direct' },
  temperature: { survivalMinC: 5, idealMinC: 18, idealMaxC: 27, survivalMaxC: 35 },
  humidity: { minimumPct: 40, idealPct: 60 },
  fertilizing: { activeSeasons: ['spring', 'summer'], inSeasonFrequencyDays: 14, reduceInDormancy: true },
  repotting: { typicalIntervalMonths: 24 },
  maintenance: { pruning: 'Trim leggy stems.', rotationDays: 14, leafCleaningDays: 30, commonPests: ['spider mites'] },
  nativeClimate: { description: 'Tropical rainforest understory.', koppen: 'Af', hardinessMinC: 10, hardinessMaxC: 38 },
  cultivars: [
    {
      name: 'Thai Constellation',
      alsoKnownAs: [],
      group: null,
      description: 'Creamy variegation speckled across the leaves.',
      careNote: 'Variegated tissue scorches more easily — keep it out of direct sun.',
    },
  ],
  metadata: {
    confidence: 'high',
    sources: [{ title: 'RHS', url: 'https://www.rhs.org.uk/plants/monstera', accessedAt: '2026-06-18' }],
  },
};

describe('speciesRecordSchema', () => {
  it('parses a complete valid record', () => {
    expect(() => parseSpeciesRecord(validRecord)).not.toThrow();
  });

  it('defaults cultivars to an empty array when omitted', () => {
    const { cultivars, ...withoutCultivars } = validRecord;
    void cultivars;
    const parsed = parseSpeciesRecord(withoutCultivars);
    expect(parsed.cultivars).toEqual([]);
  });

  it('rejects a record missing a required section', () => {
    const { watering, ...incomplete } = validRecord;
    void watering;
    expect(() => parseSpeciesRecord(incomplete)).toThrow();
  });

  it('safeParse returns success=false with issues on bad input', () => {
    const result = safeParseSpeciesRecord({ scientificName: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('exposes the schema object for advanced consumers', () => {
    expect(typeof speciesRecordSchema.parse).toBe('function');
  });

  it('defaults humiditySensitivity to low when omitted', () => {
    const { humiditySensitivity, ...wateringWithout } = validRecord.watering;
    void humiditySensitivity;
    const rec = parseSpeciesRecord({ ...validRecord, watering: wateringWithout });
    expect(rec.watering.humiditySensitivity).toBe('low');
  });

  it('accepts an explicit humiditySensitivity', () => {
    const rec = parseSpeciesRecord({
      ...validRecord,
      watering: { ...validRecord.watering, humiditySensitivity: 'high' },
    });
    expect(rec.watering.humiditySensitivity).toBe('high');
  });

  it('defaults the misting section to avoid when omitted (backward compatible)', () => {
    const rec = parseSpeciesRecord(validRecord);
    expect(rec.misting).toEqual({ benefit: 'avoid', baseFrequencyDays: null, note: null });
  });

  it('defaults commonNamesEn and commonNamesEs to an empty array when omitted', () => {
    const { commonNamesEn, commonNamesEs, ...withoutCommonNames } = validRecord;
    void commonNamesEn;
    void commonNamesEs;
    const parsed = parseSpeciesRecord(withoutCommonNames);
    expect(parsed.commonNamesEn).toEqual([]);
    expect(parsed.commonNamesEs).toEqual([]);
  });
});

describe('primaryCommonName', () => {
  it('returns the first English common name for the en locale', () => {
    expect(
      primaryCommonName({ commonNamesEn: ['Snake plant'], commonNamesEs: ['Lengua de suegra'] }, 'en'),
    ).toBe('Snake plant');
  });
  it('returns the first Spanish common name for the es locale', () => {
    expect(
      primaryCommonName({ commonNamesEn: ['Snake plant'], commonNamesEs: ['Lengua de suegra'] }, 'es'),
    ).toBe('Lengua de suegra');
  });
  it('returns null when the requested locale has no common names', () => {
    expect(primaryCommonName({ commonNamesEn: ['Snake plant'], commonNamesEs: [] }, 'es')).toBeNull();
  });
  it('returns null when both locales have no common names', () => {
    expect(primaryCommonName({ commonNamesEn: [], commonNamesEs: [] }, 'en')).toBeNull();
  });
});

describe('speciesRecordSchema growthHabit (spec §2.2)', () => {
  it('defaults growthHabit to null when the field is absent (every legacy record)', () => {
    const parsed = parseSpeciesRecord(validRecord); // validRecord has no growthHabit
    expect(parsed.growthHabit).toBeNull();
  });

  it('accepts an explicit null', () => {
    expect(parseSpeciesRecord({ ...validRecord, growthHabit: null }).growthHabit).toBeNull();
  });

  it('accepts every value in the shared GROWTH_HABITS vocabulary (enum derived from it — no fork)', () => {
    for (const habit of GROWTH_HABITS) {
      expect(parseSpeciesRecord({ ...validRecord, growthHabit: habit }).growthHabit).toBe(habit);
    }
  });

  it('rejects a value outside GROWTH_HABITS', () => {
    expect(() => parseSpeciesRecord({ ...validRecord, growthHabit: 'vine' })).toThrow();
  });
});

describe('juvenile figures (Spec 2 §6.1)', () => {
  it('defaults both juvenile fields to null on a record that predates them', () => {
    const parsed = parseSpeciesRecord(validRecord);
    expect(parsed.juvenilePeriodMonths).toBeNull();
    expect(parsed.juvenileRepotIntervalMonths).toBeNull();
  });

  it('accepts positive integer months for both', () => {
    const parsed = parseSpeciesRecord({
      ...validRecord,
      juvenilePeriodMonths: 12,
      juvenileRepotIntervalMonths: 3,
    });
    expect(parsed.juvenilePeriodMonths).toBe(12);
    expect(parsed.juvenileRepotIntervalMonths).toBe(3);
  });

  it('rejects zero, negative and fractional months on both fields', () => {
    for (const key of ['juvenilePeriodMonths', 'juvenileRepotIntervalMonths'] as const) {
      for (const bad of [0, -1, 2.5]) {
        expect(safeParseSpeciesRecord({ ...validRecord, [key]: bad }).success).toBe(false);
      }
    }
  });

  it('accepts an explicit null on both fields', () => {
    const parsed = parseSpeciesRecord({
      ...validRecord,
      juvenilePeriodMonths: null,
      juvenileRepotIntervalMonths: null,
    });
    expect(parsed.juvenilePeriodMonths).toBeNull();
    expect(parsed.juvenileRepotIntervalMonths).toBeNull();
  });
});
