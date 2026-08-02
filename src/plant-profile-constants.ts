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

// Substrate type. The array is ORDERED and `other` is documented as trailing: a new mix is inserted
// before it, never after. The Zod enum in `plant-profile.ts` DERIVES from this array — never re-declare
// the vocabulary there.
export const SOIL_MIXES = [
  'aroid',
  'all-purpose',
  'all-purpose-perlite',
  'cactus-succulent',
  'orchid-bark',
  'peat-based',
  'coco-coir',
  'semi-hydro',
  'other',
] as const;
export type SoilMix = (typeof SOIL_MIXES)[number];

/**
 * Days of plant-available nutrient reserve a FRESHLY-FILLED pot of this mix carries. `0` = the medium
 * arrives with no usable food in it.
 *
 * This is NOT a hydraulic property — it never enters the watering model. It anchors to
 * `plants.substrate_refreshed_on` and expresses a FLOOR on the fertilize schedule (never a multiplier):
 * a reserve is a stock that empties on an absolute date, not a property of frequency.
 *
 * Only FOUR cells are sourced (`all-purpose` and `peat-based` here; the same two in
 * SUBSTRATE_LIFE_DAYS). Every other cell is a TUNED position in a defended ORDERING, chosen
 * conservatively: when in doubt assume LESS charge, because under-feeding is recoverable and salt burn
 * is not. Each cell has its own row in docs/care-engine.md §7.10 — one row per cell, never one row for
 * the table.
 */
export const SUBSTRATE_CHARGE_DAYS: Record<SoilMix, number> = {
  aroid: 15,
  'all-purpose': 45,
  'all-purpose-perlite': 40,
  'cactus-succulent': 20,
  'orchid-bark': 0,
  'peat-based': 45,
  'coco-coir': 10,
  'semi-hydro': 0,
  other: 0,
};

/**
 * Days before this mix's STRUCTURE degrades enough to warrant a refresh. Organic media break down over
 * 12-18 months: porosity collapses, and below 10-15 % air-filled porosity root oxygen becomes limiting.
 * This is an independent REPOT driver, combined with crowding as "whichever comes first".
 *
 * ⚠️ `null` means one of two DISTINCT things, never conflated:
 *  - `semi-hydro` is KNOWN to be structurally non-degradable (LECA, fired clay, not organic at all) — a
 *    POSITIVE structural fact.
 *  - `other` is UNSPECIFIED, so no structural claim (degrading or not) is defensible — an ABSENCE of
 *    information.
 * Both correctly produce no deadline, for opposite reasons. Reading them as the same claim would let an
 * unspecified mix silently inherit semi-hydro's PERMANENCE claim, which no source supports.
 *
 * ⚠️ Charge and structural life are INDEPENDENT. `orchid-bark` is the cell that proves it: charge 0
 * (bark holds negligible nutrient — a fertility fact) AND life 1095 (it is organic and does decompose —
 * a structural fact). "Nutrient-inert" is a statement about food, never about structure.
 */
export const SUBSTRATE_LIFE_DAYS: Record<SoilMix, number | null> = {
  aroid: 730,
  'all-purpose': 540,
  'all-purpose-perlite': 730,
  'cactus-succulent': 900,
  'orchid-bark': 1095,
  'peat-based': 540,
  'coco-coir': 730,
  'semi-hydro': null,
  other: null,
};

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
