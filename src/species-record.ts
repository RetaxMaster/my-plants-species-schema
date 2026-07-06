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
