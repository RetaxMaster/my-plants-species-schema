import { describe, expect, it } from 'vitest';
import {
  plantProfileSchema,
  plantProfileUpdateSchema,
  windowDistanceEnum,
  potTypeEnum,
  soilMixEnum,
  growthHabitEnum,
} from './plant-profile.js';
import {
  WINDOW_DISTANCES,
  POT_TYPES,
  SOIL_MIXES,
  GROWTH_HABITS,
} from './plant-profile-constants.js';

const allNull = {
  windowDistance: null,
  growLight: null,
  potType: null,
  potSizeCm: null,
  hasDrainage: null,
  soilMix: null,
  growthHabit: null,
  ageMonths: null,
  nearHeater: null,
};

describe('plantProfileSchema', () => {
  it('accepts an all-null profile (a fully-unknown profile is valid)', () => {
    expect(plantProfileSchema.parse(allNull)).toEqual(allNull);
  });

  it('accepts a fully-populated valid profile', () => {
    const full = {
      windowDistance: 'within-1m',
      growLight: true,
      potType: 'terracotta',
      potSizeCm: 14,
      hasDrainage: true,
      soilMix: 'aroid',
      growthHabit: 'climber',
      ageMonths: 18,
      nearHeater: false,
    };
    expect(plantProfileSchema.parse(full)).toEqual(full);
  });

  it('rejects an out-of-vocabulary enum value', () => {
    expect(plantProfileSchema.safeParse({ ...allNull, potType: 'wood' }).success).toBe(false);
  });

  it('rejects a zero or negative potSizeCm', () => {
    expect(plantProfileSchema.safeParse({ ...allNull, potSizeCm: 0 }).success).toBe(false);
    expect(plantProfileSchema.safeParse({ ...allNull, potSizeCm: -5 }).success).toBe(false);
  });

  it('rejects a non-integer potSizeCm', () => {
    expect(plantProfileSchema.safeParse({ ...allNull, potSizeCm: 12.5 }).success).toBe(false);
  });

  it('rejects a negative ageMonths but accepts 0', () => {
    expect(plantProfileSchema.safeParse({ ...allNull, ageMonths: -1 }).success).toBe(false);
    expect(plantProfileSchema.parse({ ...allNull, ageMonths: 0 }).ageMonths).toBe(0);
  });
});

describe('plantProfileUpdateSchema', () => {
  it('accepts an empty object (a no-op update)', () => {
    expect(plantProfileUpdateSchema.parse({})).toEqual({});
  });

  it('accepts a single-field update (absent keys mean "leave unchanged")', () => {
    expect(plantProfileUpdateSchema.parse({ potType: 'plastic' })).toEqual({ potType: 'plastic' });
  });

  it('accepts an explicit null to clear a single field', () => {
    expect(plantProfileUpdateSchema.parse({ soilMix: null })).toEqual({ soilMix: null });
  });

  it('still rejects an out-of-vocabulary value on a partial update', () => {
    expect(plantProfileUpdateSchema.safeParse({ growthHabit: 'vine' }).success).toBe(false);
  });
});

describe('enum ↔ array drift guard', () => {
  it('each Zod enum exposes exactly its source array as its options', () => {
    expect([...windowDistanceEnum.options]).toEqual([...WINDOW_DISTANCES]);
    expect([...potTypeEnum.options]).toEqual([...POT_TYPES]);
    expect([...soilMixEnum.options]).toEqual([...SOIL_MIXES]);
    expect([...growthHabitEnum.options]).toEqual([...GROWTH_HABITS]);
  });
});

describe('measurement semantics (Spec 3 §5)', () => {
  it('potSizeCm says RIM DIAMETER, and says what it is not', () => {
    const d = plantProfileSchema.shape.potSizeCm._def.innerType._def.description as string;
    expect(d).toContain('RIM DIAMETER');
    expect(d).toContain('never the radius');
    expect(d).toContain('never the height');
  });

  it('ageMonths states its unit', () => {
    const d = plantProfileSchema.shape.ageMonths._def.innerType._def.description as string;
    expect(d).toContain('months');
  });
});
