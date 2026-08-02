import { describe, expect, it } from 'vitest';
import {
  cultivarSchema,
  fertilizingSchema,
  humiditySchema,
  lightSchema,
  maintenanceSchema,
  metadataSchema,
  mistingSchema,
  nativeClimateSchema,
  repottingSchema,
  temperatureSchema,
  wateringSchema,
} from './sections.js';

describe('wateringSchema', () => {
  it('accepts a valid watering block', () => {
    expect(() =>
      wateringSchema.parse({
        baseIntervalDays: 7,
        soilDrynessBeforeWatering: 'half-dry',
        droughtTolerance: 'medium',
        temperatureSensitivity: 'high',
        lightSensitivity: 'medium',
        reduceInDormancy: true,
      }),
    ).not.toThrow();
  });

  it('rejects a non-positive interval', () => {
    expect(() =>
      wateringSchema.parse({
        baseIntervalDays: 0,
        soilDrynessBeforeWatering: 'half-dry',
        droughtTolerance: 'medium',
        temperatureSensitivity: 'high',
        lightSensitivity: 'medium',
        reduceInDormancy: true,
      }),
    ).toThrow();
  });
});

describe('mistingSchema', () => {
  it('defaults to avoid with null frequency and note', () => {
    const m = mistingSchema.parse({});
    expect(m).toEqual({ benefit: 'avoid', baseFrequencyDays: null, note: null });
  });
  it('accepts a beneficial schedule', () => {
    const m = mistingSchema.parse({ benefit: 'beneficial', baseFrequencyDays: 3, note: 'broad leaves' });
    expect(m.benefit).toBe('beneficial');
    expect(m.baseFrequencyDays).toBe(3);
  });
  it('rejects benefit !== avoid with a null baseFrequencyDays', () => {
    expect(() => mistingSchema.parse({ benefit: 'tolerated', baseFrequencyDays: null })).toThrow();
  });
  it('rejects avoid with a non-null baseFrequencyDays', () => {
    expect(() => mistingSchema.parse({ benefit: 'avoid', baseFrequencyDays: 5 })).toThrow();
  });
});

describe('temperatureSchema', () => {
  it('accepts ordered bounds', () => {
    expect(() =>
      temperatureSchema.parse({ survivalMinC: 5, idealMinC: 18, idealMaxC: 27, survivalMaxC: 35 }),
    ).not.toThrow();
  });

  it('rejects unordered bounds (ideal min above ideal max)', () => {
    expect(() =>
      temperatureSchema.parse({ survivalMinC: 5, idealMinC: 30, idealMaxC: 27, survivalMaxC: 35 }),
    ).toThrow();
  });
});

describe('lightSchema ordering', () => {
  it('accepts ordered light levels', () => {
    expect(() =>
      lightSchema.parse({ minimum: 'medium', ideal: 'bright-indirect', maximum: 'direct' }),
    ).not.toThrow();
  });

  it('rejects minimum brighter than maximum', () => {
    expect(() =>
      lightSchema.parse({ minimum: 'direct', ideal: 'medium', maximum: 'low' }),
    ).toThrow();
  });
});

describe('humiditySchema', () => {
  it('rejects humidity above 100%', () => {
    expect(() => humiditySchema.parse({ minimumPct: 40, idealPct: 120 })).toThrow();
  });

  it('rejects minimum above ideal', () => {
    expect(() => humiditySchema.parse({ minimumPct: 70, idealPct: 50 })).toThrow();
  });
});

describe('fertilizing / repotting / maintenance', () => {
  it('requires at least one active fertilizing season', () => {
    expect(() =>
      fertilizingSchema.parse({ activeSeasons: [], inSeasonFrequencyDays: 14, reduceInDormancy: true }),
    ).toThrow();
  });

  it('defaults repotting signs and maintenance pests to empty arrays', () => {
    const repotting = repottingSchema.parse({ typicalIntervalMonths: 18 });
    expect(repotting.signs).toEqual([]);
    const maintenance = maintenanceSchema.parse({
      pruning: 'Trim leggy stems in spring.',
      rotationDays: 14,
      leafCleaningDays: null,
    });
    expect(maintenance.commonPests).toEqual({ en: [], es: null });
  });

  it('allows null maintenance cadences', () => {
    expect(() =>
      maintenanceSchema.parse({ pruning: 'none', rotationDays: null, leafCleaningDays: null }),
    ).not.toThrow();
  });

  it('rejects an empty pruning string', () => {
    expect(() =>
      maintenanceSchema.parse({ pruning: '', rotationDays: null, leafCleaningDays: null }),
    ).toThrow();
  });
});

describe('nativeClimate / metadata', () => {
  it('accepts a native climate block with optional koppen', () => {
    expect(() =>
      nativeClimateSchema.parse({
        description: 'Tropical rainforest understory.',
        hardinessMinC: 10,
        hardinessMaxC: 38,
      }),
    ).not.toThrow();
  });

  it('rejects hardiness min above max', () => {
    expect(() =>
      nativeClimateSchema.parse({ description: 'x', hardinessMinC: 40, hardinessMaxC: 10 }),
    ).toThrow();
  });

  it('accepts metadata with confidence and at least one valid source (no briefPath)', () => {
    expect(() =>
      metadataSchema.parse({
        confidence: 'high',
        sources: [{ title: 'RHS', url: 'https://www.rhs.org.uk/', accessedAt: '2026-06-18' }],
      }),
    ).not.toThrow();
  });

  it('requires at least one source, a valid URL, and an ISO date', () => {
    expect(() => metadataSchema.parse({ confidence: 'high', sources: [] })).toThrow();
    expect(() =>
      metadataSchema.parse({
        confidence: 'high',
        sources: [{ title: 'RHS', url: 'not-a-url', accessedAt: '2026-06-18' }],
      }),
    ).toThrow();
    expect(() =>
      metadataSchema.parse({
        confidence: 'high',
        sources: [{ title: 'RHS', url: 'https://www.rhs.org.uk/', accessedAt: 'June 2026' }],
      }),
    ).toThrow();
  });
});

describe('cultivarSchema', () => {
  it('accepts a cultivar and defaults alsoKnownAs to an empty array', () => {
    const cultivar = cultivarSchema.parse({
      name: 'Massangeana',
      group: 'Deremensis Group',
      description: 'Wide yellow-lime central stripe down each leaf.',
      careNote: 'More variegation needs brighter indirect light to keep colour.',
    });
    expect(cultivar.alsoKnownAs).toEqual([]);
    expect(cultivar.name).toBe('Massangeana');
  });

  it('accepts explicit nulls for group and careNote (no nuance to record)', () => {
    expect(() =>
      cultivarSchema.parse({
        name: 'Lemon Lime',
        alsoKnownAs: ['Lemon-Lime'],
        group: null,
        description: 'Bright chartreuse/lime stripes.',
        careNote: null,
      }),
    ).not.toThrow();
  });

  it('rejects an empty name', () => {
    expect(() =>
      cultivarSchema.parse({ name: '', group: null, description: 'x', careNote: null }),
    ).toThrow();
  });
});

describe('the bilingual free-text fields (Spec 3 §4.1)', () => {
  it('maintenance accepts a LEGACY record and normalizes pruning + commonPests', () => {
    const out = maintenanceSchema.parse({
      pruning: 'Trim spent fronds at the base.',
      rotationDays: 30,
      leafCleaningDays: 45,
      commonPests: ['Spider mites', 'Mealybugs'],
    });
    expect(out.pruning).toEqual({ en: 'Trim spent fronds at the base.', es: null });
    expect(out.commonPests).toEqual({ en: ['Spider mites', 'Mealybugs'], es: null });
  });

  it('maintenance accepts a CURATED bilingual record', () => {
    const out = maintenanceSchema.parse({
      pruning: { en: 'Trim spent fronds.', es: 'Recorta las frondas secas.' },
      rotationDays: null,
      leafCleaningDays: null,
      commonPests: { en: ['Spider mites'], es: ['Ácaros'] },
    });
    expect(out.pruning.es).toBe('Recorta las frondas secas.');
    expect(out.commonPests.es).toEqual(['Ácaros']);
  });

  it('maintenance still defaults commonPests to the legacy empty list', () => {
    const out = maintenanceSchema.parse({ pruning: 'Trim.', rotationDays: null, leafCleaningDays: null });
    expect(out.commonPests).toEqual({ en: [], es: null });
  });

  it('nativeClimate localizes description and KEEPS its hardiness refinement', () => {
    const out = nativeClimateSchema.parse({
      description: { en: 'Humid tropical understorey.', es: 'Sotobosque tropical húmedo.' },
      hardinessMinC: 10,
      hardinessMaxC: 32,
    });
    expect(out.description.es).toBe('Sotobosque tropical húmedo.');
    expect(
      nativeClimateSchema.safeParse({ description: 'x', hardinessMinC: 40, hardinessMaxC: 10 }).success,
    ).toBe(false);
  });

  it('misting localizes its nullable note and KEEPS its benefit/frequency refinement', () => {
    const out = mistingSchema.parse({ benefit: 'beneficial', baseFrequencyDays: 3, note: 'Mist at dawn.' });
    expect(out.note).toEqual({ en: 'Mist at dawn.', es: null });
    expect(mistingSchema.parse({ benefit: 'avoid', baseFrequencyDays: null, note: null }).note).toBeNull();
    expect(
      mistingSchema.safeParse({ benefit: 'avoid', baseFrequencyDays: 5, note: null }).success,
    ).toBe(false);
  });

  it('cultivar localizes description and the nullable careNote', () => {
    const out = cultivarSchema.parse({
      name: "Massangeana",
      alsoKnownAs: [],
      group: null,
      description: { en: 'Broad yellow midrib stripe.', es: 'Franja amarilla ancha central.' },
      careNote: null,
    });
    expect(out.description.es).toBe('Franja amarilla ancha central.');
    expect(out.careNote).toBeNull();
  });

  it('LEAVES repotting.signs alone — Spec 5 owns its replacement and Task 45 owns its removal', () => {
    // Removing this field before Spec 5's catalogue is seeded empties the REPOT info modal's signs
    // section. This assertion exists so an over-eager cleanup goes red here rather than in production.
    expect(repottingSchema.parse({ typicalIntervalMonths: 18, signs: ['Roots out of drainage holes'] }).signs)
      .toEqual(['Roots out of drainage holes']);
  });
});
