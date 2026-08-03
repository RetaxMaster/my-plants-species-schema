import { z } from 'zod';
import { speciesRecordSchema } from './species-record.js';
import {
  COMMON_PESTS_DESCRIPTION,
  CULTIVAR_CARE_NOTE_DESCRIPTION,
  CULTIVAR_DESCRIPTION_DESCRIPTION,
  cultivarSchema,
  maintenanceSchema,
  MISTING_NOTE_DESCRIPTION,
  mistingObject,
  mistingRefinement,
  MISTING_REFINEMENT_MESSAGE,
  NATIVE_CLIMATE_DESCRIPTION,
  nativeClimateObject,
  nativeClimateRefinement,
  NATIVE_CLIMATE_REFINEMENT_MESSAGE,
  PRUNING_DESCRIPTION,
  repottingSchema,
} from './sections.js';
import { localizedListWrite, localizedTextWrite } from './localized.js';

/**
 * THE CANONICAL WRITE RECORD (Spec 3 §4.2).
 *
 * DERIVED, NEVER RE-DECLARED. Each section below is the READ section `.extend()`ed with its *Write field —
 * so every non-localized field, every default and every refinement is inherited rather than copied. A future
 * field added to `maintenanceSchema` appears here automatically; a copy would silently drift.
 *
 * WHERE IT RUNS: the three KE write entry points (`validateCuration`, `db:insert`, `db:recure`), against the
 * RAW payload, BEFORE the tolerant `speciesRecordSchema` transform ever sees it. NEVER on a read path — the
 * web, the API and both agent context builders keep using the tolerant reader, because old rows must keep
 * parsing until the one-time re-curation has filled every brief and both locales.
 */

// `.extend()` REPLACES the field's schema wholesale, so a `.describe()` set on the read field (sections.ts)
// does not carry over automatically — each write variant below re-attaches the SAME description constant
// (never a re-typed copy), so the curation tool doc keeps its guidance instead of silently going blank.
const mistingWriteSchema = mistingObject
  .extend({ note: localizedTextWrite.nullable().default(null).describe(MISTING_NOTE_DESCRIPTION) })
  .refine(mistingRefinement, MISTING_REFINEMENT_MESSAGE);

const maintenanceWriteSchema = maintenanceSchema.extend({
  pruning: localizedTextWrite.describe(PRUNING_DESCRIPTION),
  // No `.default([])` here on purpose: a legacy default would produce a bare array, which is exactly the
  // shape this schema exists to reject. A curated record states both locales explicitly, `[]` included.
  commonPests: localizedListWrite.describe(COMMON_PESTS_DESCRIPTION),
});

const nativeClimateWriteSchema = nativeClimateObject
  .extend({ description: localizedTextWrite.describe(NATIVE_CLIMATE_DESCRIPTION) })
  .refine(nativeClimateRefinement, NATIVE_CLIMATE_REFINEMENT_MESSAGE);

const cultivarWriteSchema = cultivarSchema.extend({
  description: localizedTextWrite.describe(CULTIVAR_DESCRIPTION_DESCRIPTION),
  careNote: localizedTextWrite.nullable().describe(CULTIVAR_CARE_NOTE_DESCRIPTION),
});

// `repottingSchema` (sections.ts) is deliberately TOLERANT: it is a plain `z.object`, so Zod strips an
// unknown key — which is exactly right for the READER, because a legacy stored record still carries
// `signs` (D42 removed the field; old rows keep parsing). That tolerance must never reach the WRITER: a
// curation that still supplies `repotting.signs` must be told, explicitly, where the signs actually go —
// silently discarding it would return a green validation to the operator while the field vanishes.
// `.strict(message)` is the same object (never re-declared — a copy is the fork this project forbids),
// switched from "strip" to "reject any key it does not declare", with a message naming the replacement.
const repottingWriteSchema = repottingSchema.strict(
  "'repotting.signs' is no longer part of the record (removed by D42). The species' observable " +
    "repotting signs now live in the structured repot_signs catalogue (curated via the " +
    "repot_signs_researcher / db:recure) — remove 'signs' from this section and curate the signs there.",
);

export const speciesRecordWriteSchema = speciesRecordSchema.extend({
  misting: mistingWriteSchema.default({ benefit: 'avoid', baseFrequencyDays: null, note: null }),
  repotting: repottingWriteSchema,
  maintenance: maintenanceWriteSchema,
  nativeClimate: nativeClimateWriteSchema,
  cultivars: z.array(cultivarWriteSchema).default([]),
});

export type SpeciesRecordWriteInput = z.input<typeof speciesRecordWriteSchema>;
