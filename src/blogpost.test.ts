import { describe, expect, it } from 'vitest';
import { blogpostStatusSchema, blogpostInputSchema } from './blogpost.js';

describe('blogpostStatusSchema', () => {
  it('accepts 0 and 1', () => {
    expect(blogpostStatusSchema.parse(0)).toBe(0);
    expect(blogpostStatusSchema.parse(1)).toBe(1);
  });

  it('rejects any other integer', () => {
    expect(blogpostStatusSchema.safeParse(2).success).toBe(false);
  });
});

describe('blogpostInputSchema', () => {
  const minimal = {
    slug: 'como-cuidar-pothos',
    titleEs: 'Cómo cuidar tu Pothos',
    excerptEs: 'Guía breve',
    bodyEs: '# Pothos\nContenido',
  };

  it('applies defaults: DRAFT status, null EN fields, null speciesSlug', () => {
    const parsed = blogpostInputSchema.parse(minimal);
    expect(parsed.status).toBe(0);
    expect(parsed.speciesSlug).toBeNull();
    expect(parsed.titleEn).toBeNull();
    expect(parsed.bodyEn).toBeNull();
    expect(parsed.coverImageUrl).toBeNull();
  });

  it('requires the Spanish (leading) fields', () => {
    expect(blogpostInputSchema.safeParse({ ...minimal, titleEs: '' }).success).toBe(false);
    expect(blogpostInputSchema.safeParse({ ...minimal, bodyEs: '' }).success).toBe(false);
    const { excerptEs: _drop, ...noExcerpt } = minimal;
    expect(blogpostInputSchema.safeParse(noExcerpt).success).toBe(false);
  });

  it('rejects a non-URL coverImageUrl but accepts a valid URL', () => {
    expect(blogpostInputSchema.safeParse({ ...minimal, coverImageUrl: 'not-a-url' }).success).toBe(false);
    const ok = blogpostInputSchema.parse({ ...minimal, coverImageUrl: 'https://cdn.test/x.webp' });
    expect(ok.coverImageUrl).toBe('https://cdn.test/x.webp');
  });
});
