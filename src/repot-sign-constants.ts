import { z } from 'zod';

/**
 * The KE's ORDINAL evidence classes, strongest first. The KE classifies (a false-positive-rate claim about
 * the world, sourceable); the engine calibrates (the class -> weight mapping lives in the API's
 * `engines/repot-signs.ts`, each value a docs/care-engine.md §7.10 ledger row). An agent-authored float
 * never enters the care math — see docs/care-engine.md §7.19.
 */
export const REPOT_EVIDENCE_CLASSES = ['definitive', 'strong', 'suggestive', 'ambiguous'] as const;
export type RepotEvidenceClass = (typeof REPOT_EVIDENCE_CLASSES)[number];
export const repotEvidenceClassSchema = z.enum(REPOT_EVIDENCE_CLASSES);

/** `species.slug` is VARCHAR(191). Bound here so the id ceiling below is DERIVED, never guessed. */
export const SPECIES_SLUG_MAX_LEN = 191;

/**
 * TUNED (a usability bound, docs/care-engine.md §7.10): a sign's semantic slug is a few words
 * (`crowded-clump`), never a sentence.
 */
export const REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN = 64;

/** Reserved as the namespace separator. It MUST NOT appear inside either half of an id. */
export const REPOT_SIGN_ID_SEPARATOR = '--';

/** The namespace every app-seeded, species-agnostic sign lives under. */
export const UNIVERSAL_SIGN_NAMESPACE = 'universal';

/**
 * The DERIVED width of `repot_signs.id`: the longest possible id is
 * `<species-slug>--<semantic-slug>` = 191 + 2 + 64 = 257. The migration sizes the column VARCHAR(257) to
 * hold exactly this, and a test in the API pins the DDL against this constant so the two can never drift.
 */
export const REPOT_SIGN_ID_MAX_LEN =
  SPECIES_SLUG_MAX_LEN + REPOT_SIGN_ID_SEPARATOR.length + REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN;

/** Lowercase kebab, no leading/trailing dash, and never two adjacent dashes (the reserved separator). */
const SEMANTIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const repotSignSemanticSlugSchema = z
  .string()
  .min(1)
  .max(REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN, `a semantic slug may not exceed ${REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN} characters`)
  .regex(SEMANTIC_SLUG_RE, 'a semantic slug is lowercase kebab-case and may not contain "--"');

/** The COMPOSED id: `<namespace>--<semantic-slug>`, re-validated against the same two ceilings. */
export const repotSignIdSchema = z
  .string()
  .min(1)
  .max(REPOT_SIGN_ID_MAX_LEN, `a repot sign id may not exceed ${REPOT_SIGN_ID_MAX_LEN} characters`)
  .refine((id) => {
    const at = id.indexOf(REPOT_SIGN_ID_SEPARATOR);
    if (at <= 0) return false;
    const namespace = id.slice(0, at);
    const semantic = id.slice(at + REPOT_SIGN_ID_SEPARATOR.length);
    return (
      SEMANTIC_SLUG_RE.test(namespace) &&
      namespace.length <= SPECIES_SLUG_MAX_LEN &&
      repotSignSemanticSlugSchema.safeParse(semantic).success
    );
  }, 'a repot sign id must be "<species-slug|universal>--<semantic-slug>"');

/**
 * Compose the stored id. THROWS rather than composing something invalid: an id is the permanent referent of
 * every past observation, so a malformed one must never reach the database.
 */
export function composeRepotSignId(namespace: string, semanticSlug: string): string {
  const semantic = repotSignSemanticSlugSchema.safeParse(semanticSlug);
  if (!semantic.success) {
    throw new Error(`invalid semantic slug "${semanticSlug}": ${semantic.error.issues[0]?.message}`);
  }
  const id = `${namespace}${REPOT_SIGN_ID_SEPARATOR}${semantic.data}`;
  const composed = repotSignIdSchema.safeParse(id);
  if (!composed.success) {
    throw new Error(
      `composed repot sign id "${id}" is invalid (max ${REPOT_SIGN_ID_MAX_LEN}): ${composed.error.issues[0]?.message}`,
    );
  }
  return id;
}
