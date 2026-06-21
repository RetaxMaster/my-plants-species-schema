// Controlled vocabularies shared by the schema and exported for consumers.
// Arrays are intentionally ordered (least → most) so consumers can compare by index.

export const LIGHT_LEVELS = ['low', 'medium', 'bright-indirect', 'direct'] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const SENSITIVITY = ['low', 'medium', 'high'] as const;
export type Sensitivity = (typeof SENSITIVITY)[number];

export const DROUGHT_TOLERANCE = ['low', 'medium', 'high'] as const;
export type DroughtTolerance = (typeof DROUGHT_TOLERANCE)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const MISTING_BENEFIT = ['beneficial', 'tolerated', 'avoid'] as const;
export type MistingBenefit = (typeof MISTING_BENEFIT)[number];

export const SOIL_DRYNESS = [
  'keep-moist',
  'top-inch-dry',
  'half-dry',
  'mostly-dry',
  'fully-dry',
] as const;
export type SoilDryness = (typeof SOIL_DRYNESS)[number];
