import { z } from 'zod';
import {
  CONFIDENCE_LEVELS,
  DROUGHT_TOLERANCE,
  LIGHT_LEVELS,
  MISTING_BENEFIT,
  SEASONS,
  SENSITIVITY,
  SOIL_DRYNESS,
} from './enums.js';
import { localizedList, localizedText } from './localized.js';

const lightRank = (level: (typeof LIGHT_LEVELS)[number]): number => LIGHT_LEVELS.indexOf(level);

export const wateringSchema = z.object({
  baseIntervalDays: z.number().int().positive(),
  soilDrynessBeforeWatering: z.enum(SOIL_DRYNESS),
  droughtTolerance: z.enum(DROUGHT_TOLERANCE),
  temperatureSensitivity: z.enum(SENSITIVITY),
  lightSensitivity: z.enum(SENSITIVITY),
  humiditySensitivity: z.enum(SENSITIVITY).default('low'),
  reduceInDormancy: z.boolean(),
});

// Reused verbatim on the WRITE variant of `note` in species-record-write.ts — see the comment on
// PRUNING_DESCRIPTION below for why the text is a named constant rather than re-typed.
export const MISTING_NOTE_DESCRIPTION =
  'Optional misting note. Authored in BOTH locales as { "en": "…", "es": "…" }; a bare string is the ' +
  'legacy English-only shape and is rejected on write.';

// The un-refined object is exported so the CANONICAL WRITE schema (species-record-write.ts) can `.extend()`
// it with the *Write field and re-apply the SAME refinement predicate. A ZodEffects cannot be extended, so
// without this the write schema would have to re-declare the section — the fork this project forbids.
export const mistingObject = z.object({
  benefit: z.enum(MISTING_BENEFIT).default('avoid'),
  baseFrequencyDays: z.number().int().positive().nullable().default(null),
  note: localizedText.nullable().default(null).describe(MISTING_NOTE_DESCRIPTION),
});

/** The ONE misting invariant, shared by the read and write schemas. */
export const mistingRefinement = (m: { benefit: string; baseFrequencyDays: number | null }): boolean =>
  m.benefit === 'avoid' ? m.baseFrequencyDays === null : m.baseFrequencyDays !== null;
export const MISTING_REFINEMENT_MESSAGE = {
  message: 'baseFrequencyDays must be set when benefit is beneficial/tolerated, and null when avoid',
};

export const mistingSchema = mistingObject.refine(mistingRefinement, MISTING_REFINEMENT_MESSAGE);

export const lightSchema = z
  .object({
    minimum: z.enum(LIGHT_LEVELS),
    ideal: z.enum(LIGHT_LEVELS),
    maximum: z.enum(LIGHT_LEVELS),
  })
  .refine((l) => lightRank(l.minimum) <= lightRank(l.ideal) && lightRank(l.ideal) <= lightRank(l.maximum), {
    message: 'light levels must satisfy minimum <= ideal <= maximum',
  });

export const temperatureSchema = z
  .object({
    survivalMinC: z.number(),
    idealMinC: z.number(),
    idealMaxC: z.number(),
    survivalMaxC: z.number(),
  })
  .refine(
    (t) =>
      t.survivalMinC <= t.idealMinC && t.idealMinC <= t.idealMaxC && t.idealMaxC <= t.survivalMaxC,
    { message: 'temperature bounds must satisfy survivalMin <= idealMin <= idealMax <= survivalMax' },
  );

export const humiditySchema = z
  .object({
    minimumPct: z.number().min(0).max(100),
    idealPct: z.number().min(0).max(100),
  })
  .refine((h) => h.minimumPct <= h.idealPct, { message: 'humidity minimumPct must be <= idealPct' });

export const fertilizingSchema = z.object({
  activeSeasons: z.array(z.enum(SEASONS)).min(1),
  inSeasonFrequencyDays: z.number().int().positive(),
  reduceInDormancy: z.boolean(),
});

export const repottingSchema = z.object({
  typicalIntervalMonths: z.number().int().positive(),
  // `signs` is GONE (D42). The bilingual, per-species `repot_signs` CATALOGUE replaces it: stable slug ids
  // (so a recorded observation keeps its referent across re-curations), text in both locales, and an ordinal
  // evidence class the engine can weight. Keeping the free-text array beside the catalogue would be two
  // sources for one thing — the fork this project's first rule forbids.
  //
  // Old rows still CARRY the key in their stored JSON; Zod strips unknown keys, so they keep parsing and the
  // stale English list simply stops being readable. No data migration is needed or wanted.
});

// Field-description text pulled into named constants — the SAME `.describe()` sentence is reused on the
// WRITE variant of this field in species-record-write.ts (Zod does not carry a field's `.describe()` across
// `.extend()`'s replacement of that field, so the write schema must re-attach it explicitly). A named
// constant is the single source for that sentence; only the schema's shape forks between read and write,
// never the text.
export const PRUNING_DESCRIPTION =
  'How and when to prune. REQUIRED IN BOTH LOCALES: authored as { "en": "…", "es": "…" }. When a species ' +
  'has little to say in Spanish, write a real short translated sentence — never a placeholder and ' +
  'never a copy of the English string.';
export const COMMON_PESTS_DESCRIPTION =
  'The pests this species commonly gets. Authored as { "en": [...], "es": [...] }. A genuinely ' +
  'pest-free species is an EMPTY list in both locales — that is an honest curated answer, not a gap.';

export const maintenanceSchema = z.object({
  pruning: localizedText.describe(PRUNING_DESCRIPTION),
  rotationDays: z.number().int().positive().nullable(),
  leafCleaningDays: z.number().int().positive().nullable(),
  commonPests: localizedList.default([]).describe(COMMON_PESTS_DESCRIPTION),
});

export const NATIVE_CLIMATE_DESCRIPTION =
  'The species’ native climate in prose. REQUIRED IN BOTH LOCALES — { "en": "…", "es": "…" }.';

export const nativeClimateObject = z.object({
  description: localizedText.describe(NATIVE_CLIMATE_DESCRIPTION),
  koppen: z.string().optional(),
  hardinessMinC: z.number(),
  hardinessMaxC: z.number(),
});

/** The ONE native-climate invariant, shared by the read and write schemas. */
export const nativeClimateRefinement = (n: { hardinessMinC: number; hardinessMaxC: number }): boolean =>
  n.hardinessMinC <= n.hardinessMaxC;
export const NATIVE_CLIMATE_REFINEMENT_MESSAGE = { message: 'hardinessMinC must be <= hardinessMaxC' };

export const nativeClimateSchema = nativeClimateObject.refine(
  nativeClimateRefinement,
  NATIVE_CLIMATE_REFINEMENT_MESSAGE,
);

// Reused verbatim on the WRITE variants of these two fields in species-record-write.ts — see the comment
// on PRUNING_DESCRIPTION above for why the text is a named constant rather than re-typed.
export const CULTIVAR_DESCRIPTION_DESCRIPTION =
  'What this cultivar looks like. REQUIRED IN BOTH LOCALES — { "en": "…", "es": "…" }.';
export const CULTIVAR_CARE_NOTE_DESCRIPTION =
  'Optional care nuance for this cultivar, in both locales; null when there is none.';

// A named horticultural variety within the species (e.g. Dracaena fragrans 'Massangeana').
// PURELY INFORMATIONAL: it carries identity + appearance for humans, NOT care overrides — a
// cultivar's care is treated as the species' care, so the deterministic engine never branches
// on it. Any care nuance worth mentioning goes in the free-text `careNote`, never as structured
// values that would fork the care surface.
export const cultivarSchema = z.object({
  name: z.string().min(1),
  alsoKnownAs: z.array(z.string().min(1)).default([]),
  group: z.string().min(1).nullable(),
  description: localizedText.describe(CULTIVAR_DESCRIPTION_DESCRIPTION),
  careNote: localizedText.nullable().describe(CULTIVAR_CARE_NOTE_DESCRIPTION),
});

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  accessedAt: z.string().date(),
});

export const metadataSchema = z.object({
  confidence: z.enum(CONFIDENCE_LEVELS),
  sources: z.array(sourceSchema).min(1),
});
