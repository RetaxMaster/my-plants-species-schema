import { describe, expect, it } from 'vitest';
import {
  WINDOW_DISTANCES,
  POT_TYPES,
  SOIL_MIXES,
  GROWTH_HABITS,
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
