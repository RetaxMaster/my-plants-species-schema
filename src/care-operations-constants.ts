// The domain vocabularies the proposal-operations union needs. Declared here as the canonical shared
// source; the API pins them to their Prisma/DTO origin with a parity test so they can never drift.
// Ordered least→most where an order is meaningful, matching enums.ts.

export const FREQUENCY_BEARING_TASKS = ['WATER', 'FERTILIZE', 'REPOT', 'ROTATE', 'CLEAN_LEAVES', 'MIST'] as const;
export type FrequencyBearingTask = (typeof FREQUENCY_BEARING_TASKS)[number];

export const PROGRESS_HEALTH_VALUES = ['SICK', 'POOR', 'GOOD', 'EXCELLENT'] as const;
export type ProgressHealthValue = (typeof PROGRESS_HEALTH_VALUES)[number];

/** The MariaDB signed-INT ceiling the progress sizeCm column caps at. */
export const MAX_SIZE_CM = 2_147_483_647;

/**
 * The maximum length of a free-text plant timeline NOTE (`note.create` op + the owner's note routes +
 * the web textarea). A generous journal note, comfortably inside the `@db.Text` column. ONE source —
 * every validator across the client, the owner DTO and the agent op schema references THIS constant, so
 * the bound can never drift between surfaces.
 */
export const NOTE_MAX_LEN = 2000;
