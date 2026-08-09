// Client-safe SOIL INSTRUMENT property table — Zod-FREE (no `import { z }`). The web imports this via the
// package subpath "@retaxmaster/my-plants-species-schema/soil-instrument-constants" so Zod never enters its
// client bundle. The Zod layer (`soil-reading.ts`) DERIVES its enums from these arrays, so the arrays are
// the single source of truth (no fork).
//
// Spec §4.5: each instrument is a ROW in this table, never a case per device. The engine NEVER sees a raw
// reading — every instrument normalises to ONE dimensionless quantity, the WETNESS FRACTION (1 = at
// container capacity / freshly watered, 0 = dry), and the engine consumes only that. The drying rate is the
// slope of that fraction, and is therefore instrument-independent BY CONSTRUCTION.
//
// A row declares only what the instrument IS: its unit, its scale, its direction, whether readings compare
// across pots, and WHETHER it needs a per-pot calibration. It NEVER carries the calibration VALUE, which is
// per (plant, instrument) and lives on its own record.

/** What the instrument measures. Light and pH are deliberately EXCLUDED from this run (owner decision 8);
 *  the reading record still carries `kind` + `unit` + `scale` so either can join later with NO migration. */
export const READING_KINDS = ['moisture'] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

/** BUILT NOW: one arbitrary-relative instrument and one mass-relative one. Two is what makes this
 *  abstraction exercised rather than speculative — they force every property below to be real. Capacitive
 *  (% VWC, comparable across pots) and tensiometer (kPa, HIGHER = DRIER) are a row each, later, with no
 *  engine change: the tensiometer's inverted direction resolves entirely inside its normaliser. */
export const INSTRUMENT_IDS = ['galvanic-probe', 'kitchen-scale'] as const;
export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

/** Which end of the raw scale means WET. `higher-is-drier` exists for the tensiometer row that is not built
 *  yet, and is named here so the normaliser contract is already total rather than retrofitted. */
export type InstrumentDirection = 'higher-is-wetter' | 'higher-is-drier';

/**
 * HOW the owner physically takes a reading with this instrument — a PROPERTY OF THE ROW, never a case per
 * device in the UI (QA finding F2, 2026-08-08).
 *
 * The measuring protocol is not decoration: whatever makes a series comparable to itself has to be repeated
 * identically every time, and WHAT has to be repeated depends on the instrument. An insertion probe's
 * repeatable act is a fixed depth and position (deeper soil is wetter, so a varying depth manufactures a
 * trend that does not exist); a whole-pot mass reading has no depth at all — its repeatable act is weighing
 * the same object the same way (same saucer on or off, no standing water in the tray).
 *
 * Before this field existed the app printed the INSERTION protocol — "insert to about 8 cm deep" — for the
 * kitchen scale, in the prominent alert, with the real weighing note demoted below it. That is the same
 * defect class this whole feature exists to delete: a claim published that does not describe what the app
 * is actually doing. The row now declares which protocol applies, and every surface reads it from here.
 *
 * `insertion` — the reading is taken by pushing the instrument INTO the medium; depth and distance from the
 *   centre are meaningful and are computed from the pot's own diameter.
 * `whole-pot-mass` — the reading is a property of the WHOLE pot; depth and distance are meaningless for it.
 */
export type InstrumentProtocolKind = 'insertion' | 'whole-pot-mass';

export interface InstrumentRow {
  id: InstrumentId;
  kind: ReadingKind;
  /** The physical unit of a RAW reading, for display and for the persisted reading record. */
  unit: string;
  /** A stable identifier for the raw scale, persisted with every reading so a future re-interpretation can
   *  tell which scale a historical number was on. */
  scale: string;
  direction: InstrumentDirection;
  /** How a reading is physically taken — see `InstrumentProtocolKind`. Drives which measuring protocol the
   *  measuring modal states; the per-pot depth/distance numbers are only meaningful for `insertion`. */
  protocolKind: InstrumentProtocolKind;
  /** Whether two pots' raw readings mean the same thing. FALSE for both rows built today: a cheap galvanic
   *  probe measures CONDUCTIVITY, not water, and a pot's mass depends on the pot. This is a property of the
   *  instrument, never a law wired into the engine. */
  comparableAcrossPots: boolean;
  /** Whether this instrument needs a per-(plant, instrument) calibration before it can be normalised.
   *  TRUE for the scale (grams are meaningless without this pot's own saturated and dry anchors). */
  requiresCalibration: boolean;
  /** Closed raw bounds. `rawMax === null` = open-ended (grams). */
  rawMin: number;
  rawMax: number | null;
  /** Smallest meaningful raw step, used by the web to set the number input's `step`. */
  rawStep: number;
}

export const INSTRUMENTS: Readonly<Record<InstrumentId, InstrumentRow>> = {
  'galvanic-probe': {
    id: 'galvanic-probe',
    kind: 'moisture',
    unit: 'index',
    scale: 'probe-1-10',
    direction: 'higher-is-wetter',
    protocolKind: 'insertion',
    comparableAcrossPots: false,
    requiresCalibration: false,
    rawMin: 1,
    rawMax: 10,
    rawStep: 1,
  },
  'kitchen-scale': {
    id: 'kitchen-scale',
    kind: 'moisture',
    unit: 'g',
    scale: 'pot-mass-grams',
    direction: 'higher-is-wetter',
    protocolKind: 'whole-pot-mass',
    comparableAcrossPots: false,
    requiresCalibration: true,
    rawMin: 0,
    rawMax: null,
    rawStep: 1,
  },
};

/** The same rows in declaration order — the order the web renders them in. */
export const INSTRUMENT_LIST: readonly InstrumentRow[] = INSTRUMENT_IDS.map((id) => INSTRUMENTS[id]);
