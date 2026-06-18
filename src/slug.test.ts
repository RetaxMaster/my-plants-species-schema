import { describe, expect, it } from 'vitest';
import { toSpeciesSlug } from './slug.js';

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
