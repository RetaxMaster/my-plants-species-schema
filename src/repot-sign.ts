import { z } from 'zod';
import {
  REPOT_SIGN_ID_SEPARATOR,
  UNIVERSAL_SIGN_NAMESPACE,
  repotEvidenceClassSchema,
  repotSignIdSchema,
  repotSignSemanticSlugSchema,
} from './repot-sign-constants.js';

/** Trimmed and non-empty, or it is not a label. */
const requiredText = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, 'must be non-empty in both locales'));

/** Help text is optional; a blank is NORMALISED to null so a reader never has to test for both. */
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((s) => {
    const trimmed = typeof s === 'string' ? s.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  });

/**
 * The ONE bilingual text contract for a repot sign. The KE writer and the API insert path both validate
 * against this schema — never a second, drifted check.
 *
 * `labelEs` is NEVER optional: a sign's label is authored in both locales or it is not written at all, so
 * labels have NO read-time fallback. `help` does: a null/blank `helpEs` falls back to `helpEn` on read.
 */
export const repotSignContentSchema = z.object({
  labelEn: requiredText,
  labelEs: requiredText,
  helpEn: optionalText,
  helpEs: optionalText,
});
export type RepotSignContent = z.infer<typeof repotSignContentSchema>;

/**
 * What the `repot_signs_researcher` subagent returns per sign. It proposes the semantic TAIL only — the
 * writer composes the namespaced id (`composeRepotSignId`). `rationale` + `source` are REQUIRED: a class is
 * a false-positive-rate claim about the world, and a claim with no mechanism does not ship.
 */
export const repotSignDraftSchema = repotSignContentSchema.extend({
  semanticSlug: repotSignSemanticSlugSchema,
  evidence: repotEvidenceClassSchema,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  rationale: z.string().trim().min(1),
  source: z.string().trim().min(1),
});
export type RepotSignDraft = z.infer<typeof repotSignDraftSchema>;

/** A persisted catalogue row. `speciesSlug === null` means universal (app-seeded pot physics). */
export const repotSignRowSchema = repotSignContentSchema
  .extend({
    id: repotSignIdSchema,
    speciesSlug: z.string().min(1).nullable(),
    evidence: repotEvidenceClassSchema,
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .refine(
    (row) => {
      const namespace = row.id.slice(0, row.id.indexOf(REPOT_SIGN_ID_SEPARATOR));
      return namespace === (row.speciesSlug ?? UNIVERSAL_SIGN_NAMESPACE);
    },
    { message: "the id's namespace must equal speciesSlug (or 'universal' for a universal row)", path: ['id'] },
  );
export type RepotSignRow = z.infer<typeof repotSignRowSchema>;

/** The three EXCLUSIVE answers of the questionnaire. App-owned, never catalogue rows. */
export const REPOT_EVALUATION_ANSWERS = ['signs', 'no-signs', 'could-not-check'] as const;
export type RepotEvaluationAnswer = (typeof REPOT_EVALUATION_ANSWERS)[number];

/**
 * The submit body. It carries IDS AND NOTHING ELSE — no evidence class, no label, no species. `.strict()`
 * is load-bearing: the scoring function reads the class from the resolved DB row, and a client-supplied
 * class would hand the calibration's weighting to the browser.
 */
export const repotEvaluationSubmitSchema = z.discriminatedUnion('answer', [
  z
    .object({
      answer: z.literal('signs'),
      signIds: z
        .array(repotSignIdSchema)
        .min(1, 'answer "signs" requires at least one sign — use "no-signs" instead')
        .refine((ids) => new Set(ids).size === ids.length, 'signIds must not repeat an id'),
    })
    .strict(),
  z.object({ answer: z.literal('no-signs') }).strict(),
  z.object({ answer: z.literal('could-not-check') }).strict(),
]);
export type RepotEvaluationSubmit = z.infer<typeof repotEvaluationSubmitSchema>;
