// Client-safe place vocabularies — Zod-FREE (no `import { z }`). The web imports these via the package
// subpath "@retaxmaster/my-plants-species-schema/place-constants" so Zod never enters its client bundle.
// The Zod layer (`place.ts`) DERIVES its enum from these arrays, so the arrays are the single source of
// truth (no fork). Slugs are lowercase kebab and persisted verbatim; human labels are the web's i18n
// concern, not stored here.

// How much the air MOVES at this spot (a room/place property, like humidityCharacter — NOT a per-pot
// fact). Ordered least → most movement. Air movement drives evaporation: still air lets a saturated
// boundary layer sit on the leaf/soil and throttles drying; a breeze strips it and speeds drying. Fed to
// the watering engine's airflowFactor (spec A §3.1). `null` (unset) is treated as neutral by the engine.
export const AIRFLOW = ['still', 'some', 'breezy'] as const;
export type Airflow = (typeof AIRFLOW)[number];

// The place's light level, ordered brightest → dimmest. Mirrors the Prisma enum `LightType`; an API parity
// test pins the two together so the vocabulary cannot drift from the column it validates.
export const LIGHT_TYPES = ['DIRECT', 'BRIGHT_INDIRECT', 'MEDIUM', 'LOW'] as const;
export type LightTypeSlug = (typeof LIGHT_TYPES)[number];

// How humid the air at this spot habitually is. Mirrors the Prisma enum `HumidityCharacter`. `null` (unset)
// is treated as neutral by the care engine, which is why the column is nullable and this array is not.
export const HUMIDITY_CHARACTERS = ['DRY', 'NORMAL', 'HUMID'] as const;
export type HumidityCharacterSlug = (typeof HUMIDITY_CHARACTERS)[number];
