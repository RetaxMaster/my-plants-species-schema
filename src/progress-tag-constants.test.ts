import { describe, expect, it } from 'vitest';
import { PROGRESS_TAG_KEYS, PROGRESS_TAG_GROUPS } from './progress-tag-constants.js';

describe('progress tag constants (spec §1.3)', () => {
  it('lists the 17 app-owned tag keys in catalog order (6 positive + 11 negative)', () => {
    expect([...PROGRESS_TAG_KEYS]).toEqual([
      'NEW_LEAF', 'FLOWERING', 'SEEDLING', 'LARGE_LEAVES', 'NEW_SHOOTS', 'BLOOM_COMPLETED',
      'FALLEN_LEAF', 'DROOPING', 'DRY_LEAVES', 'YELLOWING_LEAVES', 'NOT_GROWING', 'STUNTED_GROWTH',
      'LEANING', 'PESTS', 'FUNGUS', 'SPOTS', 'DISCOLORATION',
    ]);
  });

  it('maps every key to a group, and only to those keys', () => {
    expect(Object.keys(PROGRESS_TAG_GROUPS).sort()).toEqual([...PROGRESS_TAG_KEYS].sort());
    expect(PROGRESS_TAG_GROUPS.NEW_LEAF).toBe('positive');
    expect(PROGRESS_TAG_GROUPS.PESTS).toBe('negative');
    // The first six are positive; the rest negative.
    for (const k of PROGRESS_TAG_KEYS.slice(0, 6)) expect(PROGRESS_TAG_GROUPS[k]).toBe('positive');
    for (const k of PROGRESS_TAG_KEYS.slice(6)) expect(PROGRESS_TAG_GROUPS[k]).toBe('negative');
  });
});
