import { z } from 'zod';
import {
  cultivarSchema,
  fertilizingSchema,
  humiditySchema,
  lightSchema,
  maintenanceSchema,
  metadataSchema,
  mistingSchema,
  nativeClimateSchema,
  repottingSchema,
  temperatureSchema,
  wateringSchema,
} from './sections.js';
import { GROWTH_HABITS } from './plant-profile-constants.js';

export const speciesRecordSchema = z.object({
  scientificName: z.string().min(1),
  commonNamesEn: z.array(z.string().min(1)).default([]),
  commonNamesEs: z.array(z.string().min(1)).default([]),
  watering: wateringSchema,
  misting: mistingSchema.default({ benefit: 'avoid', baseFrequencyDays: null, note: null }),
  light: lightSchema,
  temperature: temperatureSchema,
  humidity: humiditySchema,
  fertilizing: fertilizingSchema,
  repotting: repottingSchema,
  maintenance: maintenanceSchema,
  nativeClimate: nativeClimateSchema,
  cultivars: z.array(cultivarSchema).default([]),
  // The species' dominant mature growth form — display-only measurement guidance for the owner (spec §2.2),
  // NOT a care-engine input. Enum DERIVED from the shared GROWTH_HABITS array (the same vocabulary the
  // per-plant profile uses) so it can never fork. Nullable + default(null): every already-curated record
  // predates this field and must parse to null (falling back to a generic measure guide) until re-cured.
  growthHabit: z.enum(GROWTH_HABITS).nullable().default(null),
  // Spec 2 §6.1 — the JUVENILE pair. Two RESEARCHED per-species figures, not a derived multiplier: no
  // horticultural source states a pot-series ratio as a law, but "how long is this species juvenile" and
  // "how often is a young one potted on" are ordinary, citable questions. This is NOT the double-counting
  // a juvenile WATERING cadence would be: a small pot already drives faster watering through `potFactor`,
  // whereas NOTHING in the engine models a juvenile filling a pot faster. See docs/care-engine.md §7.18.
  /** Age in months below which this species is treated as juvenile. Nullable: pre-dates the field. */
  juvenilePeriodMonths: z.number().int().positive().nullable().default(null),
  /** Typical repot interval WHILE juvenile, in months. Nullable: pre-dates the field. */
  juvenileRepotIntervalMonths: z.number().int().positive().nullable().default(null),
  metadata: metadataSchema,
});

export type SpeciesRecord = z.infer<typeof speciesRecordSchema>;

export function parseSpeciesRecord(data: unknown): SpeciesRecord {
  return speciesRecordSchema.parse(data);
}

export function safeParseSpeciesRecord(
  data: unknown,
): z.SafeParseReturnType<unknown, SpeciesRecord> {
  return speciesRecordSchema.safeParse(data);
}

export type CommonNameLocale = 'en' | 'es';

// The human-facing primary common name for a locale: the first name in that locale's list, or null.
// Thin + locale-scoped on purpose — the cross-locale fallback and the scientific-name fallback are the
// CONSUMER's job (the API projects both languages; the web resolves the fallback via pickLocalized).
export function primaryCommonName(
  record: { commonNamesEn: string[]; commonNamesEs: string[] },
  locale: CommonNameLocale,
): string | null {
  const list = locale === 'es' ? record.commonNamesEs : record.commonNamesEn;
  return list[0] ?? null;
}
