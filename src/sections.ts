import { z } from 'zod';
import {
  CONFIDENCE_LEVELS,
  DROUGHT_TOLERANCE,
  LIGHT_LEVELS,
  SEASONS,
  SENSITIVITY,
  SOIL_DRYNESS,
} from './enums.js';

const lightRank = (level: (typeof LIGHT_LEVELS)[number]): number => LIGHT_LEVELS.indexOf(level);

export const wateringSchema = z.object({
  baseIntervalDays: z.number().int().positive(),
  soilDrynessBeforeWatering: z.enum(SOIL_DRYNESS),
  droughtTolerance: z.enum(DROUGHT_TOLERANCE),
  temperatureSensitivity: z.enum(SENSITIVITY),
  lightSensitivity: z.enum(SENSITIVITY),
  reduceInDormancy: z.boolean(),
});

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
  signs: z.array(z.string().min(1)).default([]),
});

export const maintenanceSchema = z.object({
  pruning: z.string().min(1),
  rotationDays: z.number().int().positive().nullable(),
  leafCleaningDays: z.number().int().positive().nullable(),
  commonPests: z.array(z.string().min(1)).default([]),
});

export const nativeClimateSchema = z
  .object({
    description: z.string().min(1),
    koppen: z.string().optional(),
    hardinessMinC: z.number(),
    hardinessMaxC: z.number(),
  })
  .refine((n) => n.hardinessMinC <= n.hardinessMaxC, {
    message: 'hardinessMinC must be <= hardinessMaxC',
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
