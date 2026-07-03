import { describe, expect, it } from 'vitest';
import { slugify, toSpeciesSlug } from './slug.js';

describe('toSpeciesSlug', () => {
  it('lowercases and hyphenates a binomial name', () => {
    expect(toSpeciesSlug('Monstera deliciosa')).toBe('monstera-deliciosa');
  });

  it('collapses punctuation, quotes, and repeated separators', () => {
    expect(toSpeciesSlug("Sansevieria  trifasciata 'Laurentii'")).toBe(
      'sansevieria-trifasciata-laurentii',
    );
  });

  it('strips diacritics and trims separators', () => {
    expect(toSpeciesSlug('  Aloë vera  ')).toBe('aloe-vera');
  });

  it('throws on a name with no slug-able characters', () => {
    expect(() => toSpeciesSlug('   ')).toThrow();
  });
});

describe('slugify (shared core)', () => {
  it('normalizes to a hyphenated ascii slug', () => {
    expect(slugify("Monstera  deliciosa 'Thai'")).toBe('monstera-deliciosa-thai');
  });

  it('strips diacritics', () => {
    expect(slugify('Aloë vera')).toBe('aloe-vera');
  });

  it('returns an empty string when nothing is slug-able (callers decide)', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});
