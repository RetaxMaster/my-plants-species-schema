import { describe, expect, it } from 'vitest';
import { BlogpostStatus, toBlogpostSlug } from './blogpost-constants.js';

describe('BlogpostStatus', () => {
  it('maps DRAFT=0 and PUBLISHED=1', () => {
    expect(BlogpostStatus.DRAFT).toBe(0);
    expect(BlogpostStatus.PUBLISHED).toBe(1);
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
