import { z } from 'zod';
import { speciesRecordSchema } from './species-record.js';
import {
  cultivarSchema,
  maintenanceSchema,
  mistingObject,
  mistingRefinement,
  MISTING_REFINEMENT_MESSAGE,
  nativeClimateObject,
  nativeClimateRefinement,
  NATIVE_CLIMATE_REFINEMENT_MESSAGE,
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

const mistingWriteSchema = mistingObject
  .extend({ note: localizedTextWrite.nullable().default(null) })
  .refine(mistingRefinement, MISTING_REFINEMENT_MESSAGE);

const maintenanceWriteSchema = maintenanceSchema.extend({
  pruning: localizedTextWrite,
  // No `.default([])` here on purpose: a legacy default would produce a bare array, which is exactly the
  // shape this schema exists to reject. A curated record states both locales explicitly, `[]` included.
  commonPests: localizedListWrite,
});

const nativeClimateWriteSchema = nativeClimateObject
  .extend({ description: localizedTextWrite })
  .refine(nativeClimateRefinement, NATIVE_CLIMATE_REFINEMENT_MESSAGE);

const cultivarWriteSchema = cultivarSchema.extend({
  description: localizedTextWrite,
  careNote: localizedTextWrite.nullable(),
});

export const speciesRecordWriteSchema = speciesRecordSchema.extend({
  misting: mistingWriteSchema.default({ benefit: 'avoid', baseFrequencyDays: null, note: null }),
  maintenance: maintenanceWriteSchema,
  nativeClimate: nativeClimateWriteSchema,
  cultivars: z.array(cultivarWriteSchema).default([]),
});

export type SpeciesRecordWriteInput = z.input<typeof speciesRecordWriteSchema>;
