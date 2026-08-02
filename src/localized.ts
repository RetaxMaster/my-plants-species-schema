import { z } from 'zod';

/**
 * The bilingual free-text contract (Spec 3 §4.2).
 *
 * TOLERANT READER, CANONICAL WRITER. Every species row curated before this change stores its free text as a
 * plain English string (or array). Those rows must keep parsing between the deploy and the one-time
 * re-curation, so the READ schemas below accept EITHER shape and normalize to `{ en, es }`. The WRITE
 * schemas (localizedTextWrite / localizedListWrite) drop the legacy arm entirely, so a NEW curation cannot
 * ship English-only text.
 *
 * REMOVAL CONDITION — read this before deleting the legacy arm. The legacy branch is deleted once EVERY row
 * in production carries the object shape, which is a single query:
 *
 *   SELECT slug FROM species
 *   WHERE JSON_TYPE(JSON_EXTRACT(record, '$.maintenance.pruning')) <> 'OBJECT';
 *
 * When that returns zero rows in production, the legacy arm and this comment go. Without a stated condition,
 * transitional code becomes permanent.
 */

/** A localized free-text field. `es === null` means "not yet curated in Spanish", never "empty". */
export type LocalizedText = { en: string; es: string | null };

/**
 * A localized list. Three states, unlike LocalizedText's two:
 *   es === null → not yet curated in Spanish
 *   es === []   → curated, and there is genuinely nothing to list
 *   es === [..] → curated
 * Consumers MUST be written against that asymmetry — see pickLocalizedList below.
 */
export type LocalizedList = { en: string[]; es: string[] | null };

export const localizedText = z
  .union([
    // LEGACY: English only, as every pre-re-curation row stores it.
    z.string().min(1),
    // CURATED: both locales, both non-empty. `es: ''` is deliberately NOT expressible — a required TEXT
    // field is required in BOTH languages, so there is no "curated but blank" state for text.
    z.object({ en: z.string().min(1), es: z.string().min(1) }),
  ])
  .transform((v): LocalizedText => (typeof v === 'string' ? { en: v, es: null } : v));

export const localizedList = z
  .union([
    // LEGACY: English only.
    z.array(z.string().min(1)),
    // CURATED: both locales. Either array may itself be EMPTY — "no common pests" is an honest answer, and
    // `es: []` is what distinguishes it from "not yet curated" (`es: null`).
    z.object({ en: z.array(z.string().min(1)), es: z.array(z.string().min(1)) }),
  ])
  .transform((v): LocalizedList => (Array.isArray(v) ? { en: v, es: null } : v));

/**
 * THE CANONICAL WRITERS (Spec 3 §4.2).
 *
 * WHY THESE EXIST AT ALL, since the readers above already "validate": the readers' `.transform()` is
 * precisely what ACCEPTS a legacy string/array and upgrades it. Re-using one schema in both directions
 * therefore cannot implement "tolerant in, strict out" — a write path calling `speciesRecordSchema` would
 * happily persist English-only text forever. These are built from the SAME object arms declared above, with
 * the legacy branch and the transform removed, so the two directions can never disagree about what a
 * curated value looks like.
 *
 * Applied at exactly three KE entry points (validateCuration, db:insert, db:recure) against the RAW payload,
 * BEFORE the tolerant parse ever runs. NEVER on a read path.
 */
export const localizedTextWrite = z.object({ en: z.string().min(1), es: z.string().min(1) });
export const localizedListWrite = z.object({
  en: z.array(z.string().min(1)),
  es: z.array(z.string().min(1)),
});

/**
 * The consent/read surface's language. This is NOT a client-resolved i18n key: an `x-locale` header only
 * tells the server which string to SERVE — the server still produces the final text, so `en` and `es` can
 * never disagree about what a value MEANS, only about which words state it.
 */
export type Locale = 'en' | 'es';

/**
 * `x-locale` arrives off an HTTP header the BFF only loosely validates before forwarding (any 2-20-char
 * alnum/dash token passes there — see `my-plants-web/server/api/[...].ts`), so this is the actual boundary
 * for "what locale is this?". Anything other than the exact literal `'es'` — absent, a typo, `'es-MX'`,
 * garbage — becomes English. Falling back rather than throwing matters: a malformed header must never turn
 * a page the owner needs to read into a 500.
 *
 * This lives in the SHARED package, not in the API, because three surfaces resolve the same header (the
 * proposal renderer, the species read model, Spec 5's repot-signs seam) and a second implementation is a
 * second answer.
 */
export function resolveLocale(raw: unknown): Locale {
  return raw === 'es' ? 'es' : 'en';
}

/**
 * Resolve a localized TEXT field for a locale, falling back to English when the requested locale is not
 * curated. `es` is either null (uncurated) or a non-empty string — the schema forbids `''` — so the empty
 * check below is belt-and-braces against a hand-written object that never went through the schema.
 */
export function pickLocalizedText(value: LocalizedText, locale: Locale): string {
  if (locale === 'es' && value.es !== null && value.es !== '') return value.es;
  return value.en;
}

/**
 * Resolve a localized LIST for a locale. NOTE THE ASYMMETRY WITH TEXT, it is the whole reason `{ en, es }`
 * beat two parallel fields: only `null` means "not yet curated" and triggers the English fallback. An EMPTY
 * curated array is a real answer ("this species has no common pests") and is returned as-is.
 */
export function pickLocalizedList(value: LocalizedList, locale: Locale): string[] {
  if (locale === 'es' && value.es !== null) return value.es;
  return value.en;
}
