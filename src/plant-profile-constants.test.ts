import { describe, expect, it } from 'vitest';
import {
  WINDOW_DISTANCES,
  POT_TYPES,
  SOIL_MIXES,
  GROWTH_HABITS,
  SUBSTRATE_CHARGE_DAYS,
  SUBSTRATE_LIFE_DAYS,
} from './plant-profile-constants.js';

describe('plant-profile vocabularies', () => {
  it('orders window distances nearest → farthest, then outdoors', () => {
    expect(WINDOW_DISTANCES).toEqual([
      'on-sill',
      'within-1m',
      '1-to-2m',
      '2-to-3m',
      'over-3m',
      'outdoors',
    ]);
  });

  it('lists the pot materials with a trailing "other"', () => {
    expect(POT_TYPES).toEqual([
      'terracotta',
      'unglazed-ceramic',
      'glazed-ceramic',
      'plastic',
      'porcelain',
      'metal',
      'concrete',
      'fabric',
      'other',
    ]);
  });

  it('lists the soil mixes with all-purpose-perlite before the trailing "other"', () => {
    expect(SOIL_MIXES).toEqual([
      'aroid',
      'all-purpose',
      'all-purpose-perlite',
      'cactus-succulent',
      'orchid-bark',
      'peat-based',
      'coco-coir',
      'semi-hydro',
      'other',
    ]);
    // `other` is documented as trailing — a new mix must never land after it.
    expect(SOIL_MIXES[SOIL_MIXES.length - 1]).toBe('other');
  });

  it('lists the growth habits with a trailing "other"', () => {
    expect(GROWTH_HABITS).toEqual([
      'upright',
      'climber',
      'trailing',
      'clumping',
      'rosette',
      'tree',
      'shrub',
      'other',
    ]);
  });
});

describe('substrate per-mix tables (Spec 1 §3.2)', () => {
  it('is exhaustive over SOIL_MIXES — both tables, every key', () => {
    for (const mix of SOIL_MIXES) {
      expect(Object.prototype.hasOwnProperty.call(SUBSTRATE_CHARGE_DAYS, mix)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(SUBSTRATE_LIFE_DAYS, mix)).toBe(true);
    }
    expect(Object.keys(SUBSTRATE_CHARGE_DAYS).sort()).toEqual([...SOIL_MIXES].sort());
    expect(Object.keys(SUBSTRATE_LIFE_DAYS).sort()).toEqual([...SOIL_MIXES].sort());
  });

  it('gives every mix a non-negative integer charge', () => {
    for (const mix of SOIL_MIXES) {
      const days = SUBSTRATE_CHARGE_DAYS[mix];
      expect(Number.isInteger(days)).toBe(true);
      expect(days).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every mix a structural life that is null or a POSITIVE integer', () => {
    for (const mix of SOIL_MIXES) {
      const life = SUBSTRATE_LIFE_DAYS[mix];
      if (life === null) continue;
      expect(Number.isInteger(life)).toBe(true);
      expect(life).toBeGreaterThan(0);
    }
  });

  // §3.2 is explicit that these are INDEPENDENT properties. `orchid-bark` is the cell that proves it:
  // zero charge (a fertility fact) AND a real structural life (an organic-decomposition fact). A test
  // asserting "charge === 0 implies life === null" would encode a coincidence as a rule — so instead we
  // assert the DIVERGENCE that must survive any future re-tuning.
  it('keeps charge and structural life independent (orchid-bark: charge 0, life NOT null)', () => {
    expect(SUBSTRATE_CHARGE_DAYS['orchid-bark']).toBe(0);
    expect(SUBSTRATE_LIFE_DAYS['orchid-bark']).not.toBeNull();
  });

  // The two `null`s mean DIFFERENT things (§3.2 / §7.15). Only semi-hydro is a positive
  // "does not degrade" claim; `other` is an absence of information. Both withhold a deadline.
  it('withholds a structural deadline for exactly semi-hydro and other', () => {
    const nullMixes = SOIL_MIXES.filter((m) => SUBSTRATE_LIFE_DAYS[m] === null);
    expect(nullMixes).toEqual(['semi-hydro', 'other']);
  });

  // Pins the four CITED cells (§7.10). A change here is a change to a sourced figure, not a tuning nudge.
  it('pins the four convention-cited cells', () => {
    expect(SUBSTRATE_CHARGE_DAYS['all-purpose']).toBe(45);
    expect(SUBSTRATE_CHARGE_DAYS['peat-based']).toBe(45);
    expect(SUBSTRATE_LIFE_DAYS['all-purpose']).toBe(540);
    expect(SUBSTRATE_LIFE_DAYS['peat-based']).toBe(540);
  });
});
