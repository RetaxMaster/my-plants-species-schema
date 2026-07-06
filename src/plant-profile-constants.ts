// Client-safe plant-profile vocabularies — Zod-FREE (no `import { z }`). The web (Spec 3) imports
// these via the package subpath "@retaxmaster/my-plants-species-schema/plant-profile-constants" so
// Zod never enters its client bundle. The Zod layer (`plant-profile.ts`) DERIVES its enums from these
// arrays, so the arrays are the single source of truth for the vocabulary (no fork). Slugs are
// lowercase kebab and persisted verbatim; human labels are the web's i18n concern, not stored here.

// How far the specimen sits from its light source (ordered nearest → farthest, then outdoors).
export const WINDOW_DISTANCES = [
  'on-sill',
  'within-1m',
  '1-to-2m',
  '2-to-3m',
  'over-3m',
  'outdoors',
] as const;
export type WindowDist = (typeof WINDOW_DISTANCES)[number];

// Pot MATERIAL (affects evaporation — a future watering-modulation input; terracotta/unglazed/fabric
// breathe and dry faster, so the distinction is preserved).
export const POT_TYPES = [
  'terracotta',
  'unglazed-ceramic',
  'glazed-ceramic',
  'plastic',
  'porcelain',
  'metal',
  'concrete',
  'fabric',
  'other',
] as const;
export type PotType = (typeof POT_TYPES)[number];

// Substrate type.
export const SOIL_MIXES = [
  'aroid',
  'all-purpose',
  'cactus-succulent',
  'orchid-bark',
  'peat-based',
  'coco-coir',
  'semi-hydro',
  'other',
] as const;
export type SoilMix = (typeof SOIL_MIXES)[number];

// Growth habit of the specimen.
export const GROWTH_HABITS = [
  'upright',
  'climber',
  'trailing',
  'clumping',
  'rosette',
  'tree',
  'shrub',
  'other',
] as const;
export type GrowthHabit = (typeof GROWTH_HABITS)[number];
