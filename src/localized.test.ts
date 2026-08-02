import { describe, expect, it } from 'vitest';
import {
  localizedText,
  localizedList,
  localizedTextWrite,
  localizedListWrite,
  resolveLocale,
  pickLocalizedText,
  pickLocalizedList,
} from './localized.js';

describe('localizedText — the tolerant reader', () => {
  it('normalizes a LEGACY English-only string to { en, es: null }', () => {
    expect(localizedText.parse('Prune in spring.')).toEqual({ en: 'Prune in spring.', es: null });
  });

  it('passes the curated object form through unchanged', () => {
    const v = { en: 'Prune in spring.', es: 'Poda en primavera.' };
    expect(localizedText.parse(v)).toEqual(v);
  });

  it('rejects an empty legacy string', () => {
    expect(localizedText.safeParse('').success).toBe(false);
  });

  it('rejects an EMPTY Spanish side on the object arm — a curated-empty TEXT state is not expressible', () => {
    expect(localizedText.safeParse({ en: 'Prune in spring.', es: '' }).success).toBe(false);
  });

  it('rejects a missing Spanish side on the object arm', () => {
    expect(localizedText.safeParse({ en: 'Prune in spring.' }).success).toBe(false);
  });
});

describe('localizedList — the tolerant reader', () => {
  it('normalizes a LEGACY English-only array to { en, es: null }', () => {
    expect(localizedList.parse(['Spider mites'])).toEqual({ en: ['Spider mites'], es: null });
  });

  it('normalizes a LEGACY EMPTY array to { en: [], es: null }', () => {
    expect(localizedList.parse([])).toEqual({ en: [], es: null });
  });

  it('passes the curated object form through unchanged', () => {
    const v = { en: ['Spider mites'], es: ['Ácaros'] };
    expect(localizedList.parse(v)).toEqual(v);
  });

  it('ACCEPTS a curated-empty Spanish list — the third state TEXT does not have', () => {
    expect(localizedList.parse({ en: [], es: [] })).toEqual({ en: [], es: [] });
  });

  it('rejects an empty string INSIDE either list', () => {
    expect(localizedList.safeParse({ en: [''], es: ['Ácaros'] }).success).toBe(false);
    expect(localizedList.safeParse({ en: ['Spider mites'], es: [''] }).success).toBe(false);
  });
});

describe('localizedTextWrite / localizedListWrite — the canonical writer', () => {
  it('REJECTS the legacy English-only string that the reader accepts', () => {
    expect(localizedText.safeParse('Prune in spring.').success).toBe(true);
    expect(localizedTextWrite.safeParse('Prune in spring.').success).toBe(false);
  });

  it('REJECTS the legacy English-only array that the reader accepts', () => {
    expect(localizedList.safeParse(['Spider mites']).success).toBe(true);
    expect(localizedListWrite.safeParse(['Spider mites']).success).toBe(false);
  });

  it('accepts the curated object form and returns it unchanged (no transform)', () => {
    expect(localizedTextWrite.parse({ en: 'a', es: 'b' })).toEqual({ en: 'a', es: 'b' });
    expect(localizedListWrite.parse({ en: ['a'], es: ['b'] })).toEqual({ en: ['a'], es: ['b'] });
  });

  it('still forbids a blank Spanish TEXT side and still allows a curated-empty Spanish LIST', () => {
    expect(localizedTextWrite.safeParse({ en: 'a', es: '' }).success).toBe(false);
    expect(localizedListWrite.safeParse({ en: [], es: [] }).success).toBe(true);
  });
});

describe('resolveLocale — the ONE gate between an x-locale header and the string tables', () => {
  it('answers "es" for the exact literal only', () => {
    expect(resolveLocale('es')).toBe('es');
  });

  it('falls back to English for anything else, including near-misses and garbage', () => {
    for (const raw of ['en', 'es-MX', 'ES', undefined, null, '', 'fr', 42, {}, []]) {
      expect(resolveLocale(raw), `expected English for ${JSON.stringify(raw)}`).toBe('en');
    }
  });
});

describe('pickLocalizedText — TEXT is a TWO-state field', () => {
  it('returns the requested locale when it is curated', () => {
    expect(pickLocalizedText({ en: 'Prune', es: 'Poda' }, 'es')).toBe('Poda');
    expect(pickLocalizedText({ en: 'Prune', es: 'Poda' }, 'en')).toBe('Prune');
  });

  it('falls back to English when es is null (not yet curated)', () => {
    expect(pickLocalizedText({ en: 'Prune', es: null }, 'es')).toBe('Prune');
  });
});

describe('pickLocalizedList — LIST is a THREE-state field', () => {
  it('returns the requested locale when it is curated', () => {
    expect(pickLocalizedList({ en: ['Mites'], es: ['Ácaros'] }, 'es')).toEqual(['Ácaros']);
  });

  it('falls back to English when es is null (not yet curated)', () => {
    expect(pickLocalizedList({ en: ['Mites'], es: null }, 'es')).toEqual(['Mites']);
  });

  it('returns the EMPTY list when es is [] — curated-and-genuinely-empty is NOT a fallback trigger', () => {
    // The asymmetry that makes lists different from text. Falling back here would tell a Spanish reader a
    // species HAS pests when its curation deliberately recorded that it has none.
    expect(pickLocalizedList({ en: ['Mites'], es: [] }, 'es')).toEqual([]);
  });
});
