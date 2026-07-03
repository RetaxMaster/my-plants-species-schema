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
    expect(typeof api.hasThumbnailPrompt).toBe('function');
    expect(typeof api.toBlogpostSlug).toBe('function');
    expect(api.BlogpostStatus.PUBLISHED).toBe(1);
    expect(api.THUMBNAIL_PROMPT_OPEN).toContain('THUMBNAIL-PROMPT');
  });
});
