import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  parseSpeciesRecord,
  safeParseSpeciesRecord,
  speciesRecordSchema,
} from './species-record.js';

// Use the schema's INPUT type so fields that carry a `.default(...)` (e.g. `misting`,
// `watering.humiditySensitivity`) may be omitted from the fixture — that is exactly what the
// backward-compatibility assertions exercise.
const validRecord: z.input<typeof speciesRecordSchema> = {
  scientificName: 'Monstera deliciosa',
  commonNames: ['Swiss cheese plant'],
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
  repotting: { typicalIntervalMonths: 24, signs: ['Roots out of drainage holes'] },
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
});
