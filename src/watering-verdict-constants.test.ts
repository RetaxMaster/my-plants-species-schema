import { describe, expect, it } from 'vitest';
import {
  RECOMMENDATIONS,
  HOLD_BASES,
  UNAVAILABLE_REASONS,
} from './watering-verdict-constants.js';

describe('watering-verdict value sets (docs/care-engine.md §7.20.9)', () => {
  it('lists all three recommendations', () => {
    expect([...RECOMMENDATIONS]).toEqual(['WATER_NOW', 'HOLD', 'UNAVAILABLE']);
  });

  it('lists both hold bases', () => {
    expect([...HOLD_BASES]).toEqual(['MEASURED_SLOPE', 'SHORT_RECHECK']);
  });

  it('lists both unavailable reasons', () => {
    expect([...UNAVAILABLE_REASONS]).toEqual(['NEEDS_CALIBRATION', 'NOT_MEASURABLE']);
  });
});
