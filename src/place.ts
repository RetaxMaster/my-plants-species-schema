// The Zod layer of the place vocabulary. Imported from the package ROOT export by the API (which needs
// validation). The web imports only the Zod-free array via the ./place-constants subpath, so Zod stays
// out of the client bundle. The enum here is DERIVED from the shared array (single source of truth) —
// never re-declare the vocabulary.
import { z } from 'zod';
import { AIRFLOW, HUMIDITY_CHARACTERS, LIGHT_TYPES } from './place-constants.js';

export const airflowEnum = z.enum(AIRFLOW);
export type AirflowEnum = z.infer<typeof airflowEnum>;

export const lightTypeEnum = z.enum(LIGHT_TYPES);
export type LightTypeEnum = z.infer<typeof lightTypeEnum>;

export const humidityCharacterEnum = z.enum(HUMIDITY_CHARACTERS);
export type HumidityCharacterEnum = z.infer<typeof humidityCharacterEnum>;
