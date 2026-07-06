// The Zod layer of the plant-profile contract. Imported from the package ROOT export by the API
// (Spec 2), which needs validation + persistence. The web imports only the Zod-free arrays via the
// ./plant-profile-constants subpath, so Zod stays out of the client bundle. The enums here are
// DERIVED from the shared arrays (single source of truth) — never re-declare the vocabulary.
import { z } from 'zod';
import {
  WINDOW_DISTANCES,
  POT_TYPES,
  SOIL_MIXES,
  GROWTH_HABITS,
} from './plant-profile-constants.js';

export const windowDistanceEnum = z.enum(WINDOW_DISTANCES);
export const potTypeEnum = z.enum(POT_TYPES);
export const soilMixEnum = z.enum(SOIL_MIXES);
export const growthHabitEnum = z.enum(GROWTH_HABITS);

// A plant's optional physical profile: a bag of per-specimen facts. EVERY field is nullable, so
// "unknown" is a first-class, representable state (rendered as *Missing info* by the web and driving
// its completeness meter). This is ONLY the net-new, user-editable attributes — derived/place-sourced
// factors (height, last-repotted, the environmental factors, "Near AC" ≡ Place.climateControlled) are
// assembled read-only API-side (Spec 2), NOT modelled here, to avoid two sources of truth.
export const plantProfileSchema = z.object({
  windowDistance: windowDistanceEnum.nullable(),
  growLight: z.boolean().nullable(),
  potType: potTypeEnum.nullable(),
  potSizeCm: z.number().int().positive().nullable(),
  hasDrainage: z.boolean().nullable(),
  soilMix: soilMixEnum.nullable(),
  growthHabit: growthHabitEnum.nullable(),
  ageMonths: z.number().int().nonnegative().nullable(),
  nearHeater: z.boolean().nullable(),
});
export type PlantProfile = z.infer<typeof plantProfileSchema>;

// PATCH semantics for updates: an absent key means "leave unchanged", an explicit `null` means
// "clear this field". `.partial()` makes every key optional while keeping each field's own validation.
export const plantProfileUpdateSchema = plantProfileSchema.partial();
export type PlantProfileUpdate = z.infer<typeof plantProfileUpdateSchema>;
