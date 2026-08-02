import { describe, expect, it } from 'vitest';
import { speciesRecordSchema } from './species-record.js';
import { speciesRecordWriteSchema } from './species-record-write.js';

// A complete, CURATED record. Every localized field carries both locales.
const curated = () => ({
  scientificName: 'Nephrolepis biserrata',
  commonNamesEn: ['Giant sword fern'],
  commonNamesEs: ['Helecho espada'],
  watering: {
    baseIntervalDays: 4,
    soilDrynessBeforeWatering: 'half-dry',
    droughtTolerance: 'low',
    temperatureSensitivity: 'medium',
    lightSensitivity: 'medium',
    humiditySensitivity: 'high',
    reduceInDormancy: true,
  },
  misting: { benefit: 'beneficial', baseFrequencyDays: 3, note: { en: 'Mist at dawn.', es: 'Rocía al amanecer.' } },
  light: { minimum: 'low', ideal: 'bright-indirect', maximum: 'bright-indirect' },
  temperature: { survivalMinC: 5, idealMinC: 18, idealMaxC: 27, survivalMaxC: 35 },
  humidity: { minimumPct: 50, idealPct: 70 },
  fertilizing: { activeSeasons: ['spring', 'summer'], inSeasonFrequencyDays: 21, reduceInDormancy: true },
  repotting: { typicalIntervalMonths: 18, signs: ['Roots out of drainage holes'] },
  maintenance: {
    pruning: { en: 'Trim spent fronds.', es: 'Recorta las frondas secas.' },
    rotationDays: 30,
    leafCleaningDays: null,
    commonPests: { en: ['Spider mites'], es: ['Ácaros'] },
  },
  nativeClimate: {
    description: { en: 'Humid tropical understorey.', es: 'Sotobosque tropical húmedo.' },
    hardinessMinC: 10,
    hardinessMaxC: 32,
  },
  cultivars: [
    {
      name: 'Macho',
      alsoKnownAs: [],
      group: null,
      description: { en: 'Coarse upright fronds.', es: 'Frondas erectas y gruesas.' },
      careNote: null,
    },
  ],
  growthHabit: 'clumping',
  metadata: {
    confidence: 'high',
    sources: [{ title: 'RHS', url: 'https://www.rhs.org.uk/', accessedAt: '2026-08-01' }],
  },
});

describe('speciesRecordWriteSchema — tolerant reader, canonical writer', () => {
  it('accepts a fully curated bilingual record', () => {
    expect(speciesRecordWriteSchema.safeParse(curated()).success).toBe(true);
  });

  it.each([
    ['maintenance.pruning', (r: any) => { r.maintenance.pruning = 'Trim spent fronds.'; }],
    ['maintenance.commonPests', (r: any) => { r.maintenance.commonPests = ['Spider mites']; }],
    ['nativeClimate.description', (r: any) => { r.nativeClimate.description = 'Humid understorey.'; }],
    ['misting.note', (r: any) => { r.misting.note = 'Mist at dawn.'; }],
    ['cultivars[0].description', (r: any) => { r.cultivars[0].description = 'Coarse fronds.'; }],
    ['cultivars[0].careNote', (r: any) => { r.cultivars[0].careNote = 'Feed lightly.'; }],
  ])('REJECTS a legacy English-only %s that the READER still accepts', (_field, mutate) => {
    const record = curated();
    mutate(record);
    // The reader must still take it — old rows have to keep parsing.
    expect(speciesRecordSchema.safeParse(record).success).toBe(true);
    // The writer must not.
    expect(speciesRecordWriteSchema.safeParse(record).success).toBe(false);
  });

  it('keeps every cross-field invariant the read schema enforces', () => {
    const bad = curated();
    bad.temperature.idealMinC = 40;
    expect(speciesRecordWriteSchema.safeParse(bad).success).toBe(false);

    const badMisting = curated();
    badMisting.misting.benefit = 'avoid';
    expect(speciesRecordWriteSchema.safeParse(badMisting).success).toBe(false);
  });
});
