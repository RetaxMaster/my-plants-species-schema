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
  commonNames: z.array(z.string().min(1)).default([]),
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

// The human-facing name: the first (most recognizable) common name, or the scientific name if none.
// Single source of the "primary name" rule so the API and any other consumer never fork it.
export function primaryCommonName(record: { commonNames: string[]; scientificName: string }): string {
  return record.commonNames[0] ?? record.scientificName;
}
