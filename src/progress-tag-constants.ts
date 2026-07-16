// The progress "worth noting" tag vocabulary — Zod-FREE (same pattern as plant-profile-constants.ts /
// image-limits.ts) so it never drags Zod into the web bundle. This is the SINGLE source of the tag keys +
// their group: the API builds GET /progress/catalog's `{ key, group }` from it, and the web imports it to
// type keys and to drive a locale-parity test. The human LABEL is NOT here — it is the web's i18n concern
// (spec §1.2/§1.3). Keys are the stable wire contract and the stored value on entries; never rename one.
export const PROGRESS_TAG_KEYS = [
  // Positive / neutral
  'NEW_LEAF', 'FLOWERING', 'SEEDLING', 'LARGE_LEAVES', 'NEW_SHOOTS', 'BLOOM_COMPLETED',
  // Negative
  'FALLEN_LEAF', 'DROOPING', 'DRY_LEAVES', 'YELLOWING_LEAVES', 'NOT_GROWING', 'STUNTED_GROWTH',
  'LEANING', 'PESTS', 'FUNGUS', 'SPOTS', 'DISCOLORATION',
] as const;
export type ProgressTagKey = (typeof PROGRESS_TAG_KEYS)[number];

export type ProgressTagGroup = 'positive' | 'negative';

export const PROGRESS_TAG_GROUPS: Record<ProgressTagKey, ProgressTagGroup> = {
  NEW_LEAF: 'positive',
  FLOWERING: 'positive',
  SEEDLING: 'positive',
  LARGE_LEAVES: 'positive',
  NEW_SHOOTS: 'positive',
  BLOOM_COMPLETED: 'positive',
  FALLEN_LEAF: 'negative',
  DROOPING: 'negative',
  DRY_LEAVES: 'negative',
  YELLOWING_LEAVES: 'negative',
  NOT_GROWING: 'negative',
  STUNTED_GROWTH: 'negative',
  LEANING: 'negative',
  PESTS: 'negative',
  FUNGUS: 'negative',
  SPOTS: 'negative',
  DISCOLORATION: 'negative',
};
