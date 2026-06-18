import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_LEVELS,
  DROUGHT_TOLERANCE,
  LIGHT_LEVELS,
  SEASONS,
  SENSITIVITY,
  SOIL_DRYNESS,
} from './enums.js';

describe('controlled vocabularies', () => {
  it('orders light levels from least to most light', () => {
    expect(LIGHT_LEVELS).toEqual(['low', 'medium', 'bright-indirect', 'direct']);
  });

  it('lists the four seasons', () => {
    expect(SEASONS).toEqual(['spring', 'summer', 'autumn', 'winter']);
  });

  it('uses a shared low/medium/high scale for sensitivity, drought, and confidence', () => {
    expect(SENSITIVITY).toEqual(['low', 'medium', 'high']);
    expect(DROUGHT_TOLERANCE).toEqual(['low', 'medium', 'high']);
    expect(CONFIDENCE_LEVELS).toEqual(['low', 'medium', 'high']);
  });

  it('orders soil dryness from wettest to driest', () => {
    expect(SOIL_DRYNESS).toEqual([
      'keep-moist',
      'top-inch-dry',
      'half-dry',
      'mostly-dry',
      'fully-dry',
    ]);
  });
});
