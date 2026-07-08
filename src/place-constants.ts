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
