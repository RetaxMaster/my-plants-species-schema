import { describe, expect, it } from 'vitest';
import {
  INSTRUMENT_IDS,
  INSTRUMENTS,
  INSTRUMENT_LIST,
  READING_KINDS,
  resolutionStates,
  type InstrumentId,
} from './soil-instrument-constants.js';

describe('the instrument property table', () => {
  it('is a CLOSED list of the four rows built now (capacitive/tensiometer join later, no engine change)', () => {
    expect(INSTRUMENT_IDS).toEqual(['galvanic-probe', 'kitchen-scale', 'wooden-stick', 'finger']);
  });

  it('carries a row for EVERY id, keyed by that id — never a case per device', () => {
    for (const id of INSTRUMENT_IDS) {
      expect(INSTRUMENTS[id]).toBeDefined();
      expect(INSTRUMENTS[id].id).toBe(id);
    }
    expect(Object.keys(INSTRUMENTS).sort()).toEqual([...INSTRUMENT_IDS].sort());
  });

  it('exposes the same rows as an ordered list (the web renders this order)', () => {
    expect(INSTRUMENT_LIST.map((r) => r.id)).toEqual([...INSTRUMENT_IDS]);
  });

  it('uses lowercase kebab-case slugs (they are persisted verbatim)', () => {
    for (const id of INSTRUMENT_IDS) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has no duplicate ids', () => {
    expect(new Set(INSTRUMENT_IDS).size).toBe(INSTRUMENT_IDS.length);
  });

  it('declares only MOISTURE today — light and pH are excluded from this run (owner decision 8)', () => {
    expect(READING_KINDS).toEqual(['moisture']);
    for (const row of INSTRUMENT_LIST) expect(row.kind).toBe('moisture');
  });

  it('orders every closed raw range lo < hi, and leaves the scale open-ended', () => {
    expect(INSTRUMENTS['galvanic-probe'].rawMin).toBe(1);
    expect(INSTRUMENTS['galvanic-probe'].rawMax).toBe(10);
    expect(INSTRUMENTS['kitchen-scale'].rawMax).toBeNull(); // grams have no ceiling
    for (const row of INSTRUMENT_LIST) {
      if (row.rawMax !== null) expect(row.rawMin).toBeLessThan(row.rawMax);
    }
  });

  it('records the two properties the engine actually branches on: direction and calibration need', () => {
    expect(INSTRUMENTS['galvanic-probe'].direction).toBe('higher-is-wetter');
    expect(INSTRUMENTS['galvanic-probe'].requiresCalibration).toBe(false);
    expect(INSTRUMENTS['kitchen-scale'].direction).toBe('higher-is-wetter');
    expect(INSTRUMENTS['kitchen-scale'].requiresCalibration).toBe(true);
  });

  it('records that NONE of the four instruments built today is comparable across pots (spec §4.5)', () => {
    for (const row of INSTRUMENT_LIST) expect(row.comparableAcrossPots).toBe(false);
  });

  // QA finding F2 (2026-08-08): the measuring protocol is a PROPERTY OF THE ROW. Before this field the app
  // printed the insertion protocol ("insert to about 8 cm deep") for the kitchen scale.
  it('declares HOW a reading is taken, per row — an insertion probe and a whole-pot mass are not the same act', () => {
    expect(INSTRUMENTS['galvanic-probe'].protocolKind).toBe('insertion');
    expect(INSTRUMENTS['kitchen-scale'].protocolKind).toBe('whole-pot-mass');
  });

  it('gives EVERY row a protocol kind, so no surface has to fall back to a default that would be wrong', () => {
    for (const row of INSTRUMENT_LIST) {
      expect(['insertion', 'whole-pot-mass']).toContain(row.protocolKind);
    }
  });

  it('never declares a whole-pot-mass instrument as needing insertion depth: the two are mutually exclusive', () => {
    // The pairing that matters downstream — a `whole-pot-mass` row must never be rendered with a depth, and
    // the only thing that can make that true is that no row claims both.
    for (const row of INSTRUMENT_LIST) {
      expect(row.protocolKind === 'insertion' || row.protocolKind === 'whole-pot-mass').toBe(true);
    }
    expect(INSTRUMENT_LIST.filter((r) => r.protocolKind === 'insertion').map((r) => r.id))
      .toEqual(['galvanic-probe', 'wooden-stick', 'finger']);
  });

  it('types an unknown id out of existence', () => {
    // @ts-expect-error 'tensiometer' is not a row yet
    const bad: InstrumentId = 'tensiometer';
    expect(bad).toBe('tensiometer');
  });

  it('is declared on every row, so no consumer has to branch on the id', () => {
    for (const row of INSTRUMENT_LIST) {
      expect(['numeric', 'ordinal']).toContain(row.captureKind);
    }
  });

  it('the two numeric instruments built in 2026-08 are numeric', () => {
    expect(INSTRUMENTS['galvanic-probe'].captureKind).toBe('numeric');
    expect(INSTRUMENTS['kitchen-scale'].captureKind).toBe('numeric');
  });

  describe('the wooden stick — an ordinal instrument that costs nothing', () => {
    it('is a row like any other', () => {
      const row = INSTRUMENTS['wooden-stick'];
      expect(row.kind).toBe('moisture');
      expect(row.captureKind).toBe('ordinal');
      expect(row.direction).toBe('higher-is-wetter');
    });

    it('is pushed INTO the medium, so it follows the insertion protocol', () => {
      expect(INSTRUMENTS['wooden-stick'].protocolKind).toBe('insertion');
    });

    it('needs NO calibration — its levels are defined by the observation, not by this pot', () => {
      expect(INSTRUMENTS['wooden-stick'].requiresCalibration).toBe(false);
    });

    it('carries exactly three levels on a closed 1..3 scale', () => {
      const row = INSTRUMENTS['wooden-stick'];
      expect(row.rawMin).toBe(1);
      expect(row.rawMax).toBe(3);
      expect(row.rawStep).toBe(1);
    });

    it('does NOT compare across pots — the same stick in two pots means two different things', () => {
      expect(INSTRUMENTS['wooden-stick'].comparableAcrossPots).toBe(false);
    });
  });

  describe('the finger — the same observation, a different zone', () => {
    it('is an ordinal insertion instrument needing no calibration', () => {
      const row = INSTRUMENTS['finger'];
      expect(row.captureKind).toBe('ordinal');
      expect(row.protocolKind).toBe('insertion');
      expect(row.requiresCalibration).toBe(false);
    });

    it('carries the same three levels as the stick — the observation is identical', () => {
      expect(INSTRUMENTS['finger'].rawMin).toBe(1);
      expect(INSTRUMENTS['finger'].rawMax).toBe(3);
    });

    // The reason the two are separate rows rather than one. A stick reaches the bottom of the pot; a finger
    // reaches about 3 cm. Deep soil is wetter, so these measure DIFFERENT ZONES and must be able to carry
    // different protocols and different engine ceilings. Merging them would have the app instruct a finger
    // owner to measure at a depth only a stick reaches.
    it('is a DISTINCT row from the wooden stick, never an alias', () => {
      expect(INSTRUMENTS['finger'].id).not.toBe(INSTRUMENTS['wooden-stick'].id);
      expect(INSTRUMENTS['finger'].scale).not.toBe(INSTRUMENTS['wooden-stick'].scale);
    });
  });

  describe('resolutionStates — derived from the row, never declared beside it', () => {
    it('counts the states of a closed scale', () => {
      expect(resolutionStates(INSTRUMENTS['galvanic-probe'])).toBe(10);
      expect(resolutionStates(INSTRUMENTS['wooden-stick'])).toBe(3);
      expect(resolutionStates(INSTRUMENTS['finger'])).toBe(3);
    });

    it('reports null for an OPEN-ENDED scale — grams are continuous, not a count', () => {
      expect(resolutionStates(INSTRUMENTS['kitchen-scale'])).toBeNull();
    });

    // The whole point of deriving rather than declaring: an instrument's precision cannot contradict the
    // scale it publishes, because there is only one place the fact lives.
    it('follows the row\'s own bounds for every instrument in the table', () => {
      for (const row of INSTRUMENT_LIST) {
        const expected = row.rawMax === null
          ? null
          : Math.floor((row.rawMax - row.rawMin) / row.rawStep) + 1;
        expect(resolutionStates(row)).toBe(expected);
      }
    });

    it('a finer instrument reports more states than a coarser one', () => {
      expect(resolutionStates(INSTRUMENTS['galvanic-probe'])!)
        .toBeGreaterThan(resolutionStates(INSTRUMENTS['wooden-stick'])!);
    });
  });
});
