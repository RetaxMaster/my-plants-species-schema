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

// The place's light level, ordered brightest → dimmest. Mirrors the API's Prisma enum `LightType`
// (repos/my-plants-api/prisma/schema.prisma) exactly, by inspection — but nothing pins the two together
// YET: my-plants-api consumes this package as a packed tarball, and the tarball is not repacked until
// Task 2.11 lands. A parity test in my-plants-api asserting this array against `LightType` is an OPEN
// OBLIGATION of this feature, not yet discharged; do not read this comment as "already checked".
export const LIGHT_TYPES = ['DIRECT', 'BRIGHT_INDIRECT', 'MEDIUM', 'LOW'] as const;
// Suffixed `Slug`, unlike the sibling `Airflow` type above: a bare `LightType` would collide with Prisma's
// own enum name and with the hand-rolled `LightType` in repos/my-plants-web/types/api.ts.
export type LightTypeSlug = (typeof LIGHT_TYPES)[number];

// How humid the air at this spot habitually is. Mirrors the API's Prisma enum `HumidityCharacter`
// (repos/my-plants-api/prisma/schema.prisma) exactly, by inspection — same open obligation as
// `LIGHT_TYPES` above: no parity test exists yet, pending the packed tarball reaching my-plants-api
// (Task 2.11). `null` (unset) is treated as neutral by the care engine, which is why the column is
// nullable and this array is not.
export const HUMIDITY_CHARACTERS = ['DRY', 'NORMAL', 'HUMID'] as const;
// Suffixed `Slug` for the same reason as `LightTypeSlug`: avoids colliding with Prisma's `HumidityCharacter`
// enum and with the hand-rolled `HumidityCharacter` in repos/my-plants-web/types/api.ts.
export type HumidityCharacterSlug = (typeof HUMIDITY_CHARACTERS)[number];
