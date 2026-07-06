import { describe, expect, it } from 'vitest';
import * as api from './index.js';

describe('public API surface', () => {
  it('re-exports the schema, helpers, slug, types, and vocabularies', () => {
    expect(typeof api.speciesRecordSchema).toBe('object');
    expect(typeof api.parseSpeciesRecord).toBe('function');
    expect(typeof api.safeParseSpeciesRecord).toBe('function');
    expect(typeof api.toSpeciesSlug).toBe('function');
    expect(api.LIGHT_LEVELS).toContain('bright-indirect');
    expect(api.SEASONS).toContain('summer');
    expect(typeof api.blogpostInputSchema).toBe('object');
    expect(typeof api.blogpostStatusSchema).toBe('object');
    expect(typeof api.toBlogpostSlug).toBe('function');
    expect(api.BlogpostStatus.PUBLISHED).toBe(1);
    expect(typeof api.plantProfileSchema).toBe('object');
    expect(typeof api.plantProfileUpdateSchema).toBe('object');
    expect(typeof api.windowDistanceEnum).toBe('object');
    expect(api.WINDOW_DISTANCES).toContain('on-sill');
    expect(api.POT_TYPES).toContain('terracotta');
    expect(api.SOIL_MIXES).toContain('aroid');
    expect(api.GROWTH_HABITS).toContain('upright');
  });
});
