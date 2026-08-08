import { describe, expect, it } from 'vitest';
import {
  INSTRUMENT_IDS,
  INSTRUMENTS,
  INSTRUMENT_LIST,
  READING_KINDS,
  type InstrumentId,
} from './soil-instrument-constants.js';

describe('the instrument property table', () => {
  it('is a CLOSED list of the two rows built now (capacitive/tensiometer join later, no engine change)', () => {
    expect(INSTRUMENT_IDS).toEqual(['galvanic-probe', 'kitchen-scale']);
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

  it('records that NEITHER instrument built today is comparable across pots (spec §4.5)', () => {
    for (const row of INSTRUMENT_LIST) expect(row.comparableAcrossPots).toBe(false);
  });

  it('types an unknown id out of existence', () => {
    // @ts-expect-error 'tensiometer' is not a row yet
    const bad: InstrumentId = 'tensiometer';
    expect(bad).toBe('tensiometer');
  });
});
