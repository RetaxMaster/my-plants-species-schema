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

/** BUILT NOW: two numeric instruments (one arbitrary-relative, one mass-relative) and two ordinal ones that
 *  read the same three-state observation at a different depth. Four is what makes this abstraction exercised
 *  rather than speculative — they force every property below to be real, on both capture kinds. Capacitive
 *  (% VWC, comparable across pots) and tensiometer (kPa, HIGHER = DRIER) are a row each, later, with no
 *  engine change: the tensiometer's inverted direction resolves entirely inside its normaliser. */
export const INSTRUMENT_IDS = ['galvanic-probe', 'kitchen-scale', 'wooden-stick', 'finger'] as const;
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

/**
 * HOW the owner supplies a reading — a PROPERTY OF THE ROW, never a case per device in the UI, for the same
 * reason `protocolKind` is (QA finding F2, 2026-08-08).
 *
 * `numeric` — the instrument reports a number on a continuous or fine scale, and the owner types it.
 * `ordinal` — the instrument reports one of a few named states, and the owner PICKS one. A wooden stick
 *   does not produce a number; it produces "comes out clean" or "damp soil sticks to it". Rendering a
 *   number field for it would invite an answer the instrument cannot give.
 *
 * The wire format is unchanged either way: an ordinal reading sends its LEVEL as `rawValue`, bounded by the
 * row's own `rawMin`/`rawMax` exactly as every other instrument is. One transport, one write path.
 */
export type InstrumentCaptureKind = 'numeric' | 'ordinal';

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
  /** How the owner supplies a reading — see `InstrumentCaptureKind`. Drives whether the measuring modal
   *  renders a number field or a choice control. */
  captureKind: InstrumentCaptureKind;
  /** Whether two pots' raw readings mean the same thing. FALSE for all four rows built today, for TWO
   *  different reasons depending on the instrument. For the probe and the scale it is PHYSICAL: a cheap
   *  galvanic probe measures CONDUCTIVITY, not water, and a pot's mass depends on the pot itself. For the
   *  stick and the finger it is that the reading is a SUBJECTIVE judgement with no fixed physical reference —
   *  "damp soil sticks to it" depends on the soil, the observer and the day, so the same level in two pots is
   *  not the same wetness. Both reasons land on the same boolean, but they are not the same claim, and a
   *  future normaliser must not assume they are. This is a property of the instrument, never a law wired
   *  into the engine. */
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
    captureKind: 'numeric',
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
    captureKind: 'numeric',
    comparableAcrossPots: false,
    requiresCalibration: true,
    rawMin: 0,
    rawMax: null,
    rawStep: 1,
  },
  /** Free — no hardware to own, so no owner is gated out of measuring by it. The reading is not a number: the
   *  stick is pushed to the bottom of the pot, pulled out, and the owner picks one of three named states
   *  ("comes out clean" / "a little dry soil clings" / "damp soil sticks to it"), which is why `captureKind`
   *  is `ordinal` and `rawValue` carries the LEVEL (1..3), not a measurement. */
  'wooden-stick': {
    id: 'wooden-stick',
    kind: 'moisture',
    unit: 'level',
    scale: 'stick-clean-to-damp',
    direction: 'higher-is-wetter',
    protocolKind: 'insertion',
    captureKind: 'ordinal',
    comparableAcrossPots: false,
    requiresCalibration: false,
    rawMin: 1,
    rawMax: 3,
    rawStep: 1,
  },
  /** The same three-LEVEL shape as the wooden stick, taken with no instrument at all: level 1 "it feels dry",
   *  level 2 "barely damp", level 3 "clearly damp". It is a SEPARATE row rather than an alias because it
   *  reaches a different depth: a stick goes to the bottom of the pot, a finger reaches about 3 cm — and
   *  deeper soil is wetter, so the two are reading different zones. Giving them the same row would have the
   *  app instruct a finger owner to judge soil at a depth their finger never touches, and would prevent the
   *  stick and the finger from ever carrying different protocols or different engine ceilings later. */
  finger: {
    id: 'finger',
    kind: 'moisture',
    unit: 'level',
    scale: 'finger-dry-to-damp',
    direction: 'higher-is-wetter',
    protocolKind: 'insertion',
    captureKind: 'ordinal',
    comparableAcrossPots: false,
    requiresCalibration: false,
    rawMin: 1,
    rawMax: 3,
    rawStep: 1,
  },
};

/** The same rows in declaration order — the order the web renders them in. */
export const INSTRUMENT_LIST: readonly InstrumentRow[] = INSTRUMENT_IDS.map((id) => INSTRUMENTS[id]);
