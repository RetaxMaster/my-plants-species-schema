import { describe, expect, it } from 'vitest';
import {
  fertilizingSchema,
  humiditySchema,
  lightSchema,
  maintenanceSchema,
  metadataSchema,
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
    expect(maintenance.commonPests).toEqual([]);
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
