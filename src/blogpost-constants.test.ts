import { describe, expect, it } from 'vitest';
import {
  BlogpostStatus,
  THUMBNAIL_PROMPT_OPEN,
  THUMBNAIL_PROMPT_CLOSE,
  hasThumbnailPrompt,
  toBlogpostSlug,
} from './blogpost-constants.js';

describe('BlogpostStatus', () => {
  it('maps DRAFT=0 and PUBLISHED=1', () => {
    expect(BlogpostStatus.DRAFT).toBe(0);
    expect(BlogpostStatus.PUBLISHED).toBe(1);
  });
});

describe('hasThumbnailPrompt', () => {
  it('detects the open delimiter anywhere in the body', () => {
    const body = `${THUMBNAIL_PROMPT_OPEN}\ngenerate a cover\n${THUMBNAIL_PROMPT_CLOSE}\n# Real body`;
    expect(hasThumbnailPrompt(body)).toBe(true);
  });

  it('is false for a clean body and for null/undefined', () => {
    expect(hasThumbnailPrompt('# Just a clean post')).toBe(false);
    expect(hasThumbnailPrompt(null)).toBe(false);
    expect(hasThumbnailPrompt(undefined)).toBe(false);
    expect(hasThumbnailPrompt('')).toBe(false);
  });
});

describe('toBlogpostSlug', () => {
  it('derives a slug from a title with the same normalization as species slugs', () => {
    expect(toBlogpostSlug('¿Cómo cuidar tu Pothos?')).toBe('como-cuidar-tu-pothos');
  });

  it('throws when the title yields nothing slug-able', () => {
    expect(() => toBlogpostSlug('   ')).toThrow();
  });
});
