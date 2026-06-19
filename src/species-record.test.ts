import { describe, expect, it } from 'vitest';
import {
  parseSpeciesRecord,
  safeParseSpeciesRecord,
  speciesRecordSchema,
  type SpeciesRecord,
} from './species-record.js';

const validRecord: SpeciesRecord = {
  scientificName: 'Monstera deliciosa',
  commonNames: ['Swiss cheese plant'],
  watering: {
    baseIntervalDays: 7,
    soilDrynessBeforeWatering: 'half-dry',
    droughtTolerance: 'medium',
    temperatureSensitivity: 'high',
    lightSensitivity: 'medium',
    reduceInDormancy: true,
  },
  light: { minimum: 'medium', ideal: 'bright-indirect', maximum: 'direct' },
  temperature: { survivalMinC: 5, idealMinC: 18, idealMaxC: 27, survivalMaxC: 35 },
  humidity: { minimumPct: 40, idealPct: 60 },
  fertilizing: { activeSeasons: ['spring', 'summer'], inSeasonFrequencyDays: 14, reduceInDormancy: true },
  repotting: { typicalIntervalMonths: 24, signs: ['Roots out of drainage holes'] },
  maintenance: { pruning: 'Trim leggy stems.', rotationDays: 14, leafCleaningDays: 30, commonPests: ['spider mites'] },
  nativeClimate: { description: 'Tropical rainforest understory.', koppen: 'Af', hardinessMinC: 10, hardinessMaxC: 38 },
  metadata: {
    confidence: 'high',
    sources: [{ title: 'RHS', url: 'https://www.rhs.org.uk/plants/monstera', accessedAt: '2026-06-18' }],
  },
};

describe('speciesRecordSchema', () => {
  it('parses a complete valid record', () => {
    expect(() => parseSpeciesRecord(validRecord)).not.toThrow();
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
});
