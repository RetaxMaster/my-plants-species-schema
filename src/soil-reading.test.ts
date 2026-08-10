import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  instrumentIdEnum,
  readingKindEnum,
  soilReadingCreateSchema,
  instrumentCalibrationSchema,
  instrumentCalibrationSchemaFor,
  rawValueRangeRefinement,
  wateringRelationEnum,
  WATERING_RELATIONS,
} from './soil-reading.js';
import { INSTRUMENT_IDS, INSTRUMENT_LIST, READING_KINDS } from './soil-instrument-constants.js';

// `rawValueRangeRefinement` STANDALONE (extracted 2026-08-09, code review on 6f4ed3e): the whole point of
// extracting it is that a SIBLING schema — the read-only verdict preview in `my-plants-api` — can call the
// SAME function via `.superRefine(rawValueRangeRefinement)` without re-typing the bound. This suite proves
// the extracted function is independently correct, not merely exercised as a side effect of
// `soilReadingCreateSchema`'s own tests below (which continue to cover it through that schema too).
describe('rawValueRangeRefinement (shared, extracted from soilReadingCreateSchema)', () => {
  // A minimal schema carrying nothing but the two fields the refinement needs — the SAME shape a preview
  // schema would build, proving the function works with no other fields chained around it.
  const minimal = z.object({ instrumentId: instrumentIdEnum, rawValue: z.number().finite() })
    .superRefine(rawValueRangeRefinement);

  it('rejects a value outside a CLOSED scale (the probe\'s printed 1..10)', () => {
    expect(minimal.safeParse({ instrumentId: 'galvanic-probe', rawValue: 99 }).success).toBe(false);
    expect(minimal.safeParse({ instrumentId: 'galvanic-probe', rawValue: -50 }).success).toBe(false);
  });

  it('accepts a value inside the closed scale, both endpoints inclusive', () => {
    expect(minimal.safeParse({ instrumentId: 'galvanic-probe', rawValue: 1 }).success).toBe(true);
    expect(minimal.safeParse({ instrumentId: 'galvanic-probe', rawValue: 10 }).success).toBe(true);
  });

  it('accepts the OPEN-ENDED kitchen scale\'s large weights — only the floor binds', () => {
    expect(minimal.safeParse({ instrumentId: 'kitchen-scale', rawValue: 1_000_000 }).success).toBe(true);
    expect(minimal.safeParse({ instrumentId: 'kitchen-scale', rawValue: 0 }).success).toBe(true);
    expect(minimal.safeParse({ instrumentId: 'kitchen-scale', rawValue: -1 }).success).toBe(false);
  });

  // QA 2026-08-10. `5.5` on a probe that declares `rawStep: 1` over a 1..10 index is a reading with more
  // precision than the instrument can produce, stored as if it had been measured — the same class as the
  // out-of-range clamp this refinement was written for, one digit further in.
  it('rejects a fractional reading on a CLOSED integer scale', () => {
    const bad = minimal.safeParse({ instrumentId: 'galvanic-probe', rawValue: 5.5 });
    expect(bad.success).toBe(false);
    // The message must name the granularity, not merely repeat the bounds — the value IS within 1..10, so
    // a bounds-flavoured message would send the owner looking for the wrong problem.
    expect(bad.success === false && bad.error.issues[0]!.message).toContain('whole step');
  });

  it('rejects a fraction on the ordinal rows too — a named state has no half', () => {
    expect(minimal.safeParse({ instrumentId: 'wooden-stick', rawValue: 2.5 }).success).toBe(false);
    expect(minimal.safeParse({ instrumentId: 'finger', rawValue: 1.5 }).success).toBe(false);
    expect(minimal.safeParse({ instrumentId: 'wooden-stick', rawValue: 2 }).success).toBe(true);
  });

  // ⚠️ THE CASE THE OBVIOUS FIX BREAKS. The kitchen scale ALSO declares `rawStep: 1`, but its `rawMax` is
  // `null` because grams are open-ended — and `1234.5 g` is what a real kitchen scale actually reads. A
  // step check that ignored the closed-scale condition would refuse a perfectly good measurement. The
  // Codex gate flagged this trap before the fix was written; this case is what keeps it flagged.
  it('still accepts a FRACTIONAL weight on the open-ended scale', () => {
    expect(minimal.safeParse({ instrumentId: 'kitchen-scale', rawValue: 1234.5 }).success).toBe(true);
    expect(minimal.safeParse({ instrumentId: 'kitchen-scale', rawValue: 0.25 }).success).toBe(true);
  });

  it('reports the BOUNDS problem, not the step problem, when a value is both', () => {
    // `99.5` is out of range AND off-step. One issue, and it must be the one the owner can act on.
    const bad = minimal.safeParse({ instrumentId: 'galvanic-probe', rawValue: 99.5 });
    expect(bad.success).toBe(false);
    expect(bad.success === false && bad.error.issues).toHaveLength(1);
    expect(bad.success === false && bad.error.issues[0]!.message).toContain('outside');
  });
});

describe('the Zod layer is DERIVED from the constant arrays (no fork)', () => {
  it('derives the instrument enum from INSTRUMENT_IDS', () => {
    expect(instrumentIdEnum.options).toEqual([...INSTRUMENT_IDS]);
  });

  it('derives the kind enum from READING_KINDS', () => {
    expect(readingKindEnum.options).toEqual([...READING_KINDS]);
  });

  it('derives the watering-relation enum from WATERING_RELATIONS', () => {
    expect(wateringRelationEnum.options).toEqual([...WATERING_RELATIONS]);
  });

  it('WATERING_RELATIONS is closed to exactly BEFORE and AFTER', () => {
    expect(WATERING_RELATIONS).toEqual(['BEFORE', 'AFTER']);
  });
});

describe('soilReadingCreateSchema', () => {
  const base = { instrumentId: 'galvanic-probe', rawValue: 6, measuredOn: '2026-08-08' } as const;

  it('accepts a well-formed reading with no verdict', () => {
    expect(soilReadingCreateSchema.parse({ ...base }).verdict).toBe('NONE');
  });

  it('rejects an unknown instrument', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, instrumentId: 'tensiometer' }).success).toBe(false);
  });

  it('rejects a non-finite raw value', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: Number.NaN }).success).toBe(false);
  });

  // QA finding F5 (2026-08-08): `99`, `-50` and `1e9` all returned 201 on a 1–10 probe. The `[0,1]` wetness
  // invariant held by CLAMPING — and a clamped anchor is a fabricated one in the owner's own record.
  describe('rawValue must lie on the instrument\'s own declared scale (QA F5)', () => {
    it('rejects a value ABOVE the probe\'s printed ceiling', () => {
      expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: 99 }).success).toBe(false);
      expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: 1e9 }).success).toBe(false);
    });

    it('rejects a value BELOW the probe\'s printed floor, including a negative one', () => {
      expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: 0 }).success).toBe(false);
      expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: -50 }).success).toBe(false);
    });

    it('accepts both endpoints — the bound is INCLUSIVE, a reading of exactly 1 or 10 is real', () => {
      expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: 1 }).success).toBe(true);
      expect(soilReadingCreateSchema.safeParse({ ...base, rawValue: 10 }).success).toBe(true);
    });

    it('leaves an OPEN-ENDED scale open: grams have no ceiling, so only the floor binds', () => {
      const scale = { instrumentId: 'kitchen-scale', measuredOn: '2026-08-08' } as const;
      expect(soilReadingCreateSchema.safeParse({ ...scale, rawValue: 1_000_000 }).success).toBe(true);
      expect(soilReadingCreateSchema.safeParse({ ...scale, rawValue: 0 }).success).toBe(true);
      // …but a negative mass is not a reading anybody took.
      expect(soilReadingCreateSchema.safeParse({ ...scale, rawValue: -1 }).success).toBe(false);
    });

    it('names the offending field and the real bounds, so the client can say something useful', () => {
      const parsed = soilReadingCreateSchema.safeParse({ ...base, rawValue: 99 });
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      const issue = parsed.error.issues.find((i) => i.path[0] === 'rawValue');
      expect(issue).toBeDefined();
      expect(issue!.message).toContain('galvanic-probe');
      expect(issue!.message).toContain('1..10');
    });

    it('reads its bounds from the instrument ROW, so every row is covered without a hand-written list', () => {
      for (const row of INSTRUMENT_LIST) {
        const ok = { instrumentId: row.id, rawValue: row.rawMin, measuredOn: '2026-08-08' };
        expect(soilReadingCreateSchema.safeParse(ok).success).toBe(true);
        const low = { instrumentId: row.id, rawValue: row.rawMin - 1, measuredOn: '2026-08-08' };
        expect(soilReadingCreateSchema.safeParse(low).success).toBe(false);
        if (row.rawMax !== null) {
          // The upper bound is INCLUSIVE too — rawMax itself must be ACCEPTED, not just rawMax + 1
          // rejected. An off-by-one fork that narrowed the accepted range (`>` vs `>=`) would pass
          // every other assertion here while silently refusing the row's own wettest reading.
          const atMax = { instrumentId: row.id, rawValue: row.rawMax, measuredOn: '2026-08-08' };
          expect(soilReadingCreateSchema.safeParse(atMax).success).toBe(true);
          const high = { instrumentId: row.id, rawValue: row.rawMax + 1, measuredOn: '2026-08-08' };
          expect(soilReadingCreateSchema.safeParse(high).success).toBe(false);
        }
      }
    });
  });

  it('rejects a malformed calendar date (strictYmd, the shared existence check)', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, measuredOn: '2026-02-31' }).success).toBe(false);
  });

  it('REQUIRES postponeToOn when the verdict is POSTPONE, and refuses it otherwise', () => {
    expect(soilReadingCreateSchema.safeParse({ ...base, verdict: 'POSTPONE' }).success).toBe(false);
    expect(
      soilReadingCreateSchema.safeParse({ ...base, verdict: 'POSTPONE', postponeToOn: '2026-08-12' }).success,
    ).toBe(true);
    expect(
      soilReadingCreateSchema.safeParse({ ...base, verdict: 'WATER_NOW', postponeToOn: '2026-08-12' }).success,
    ).toBe(false);
  });

  describe('wateringRelation — the same-day-reading disambiguation (owner-ruled, 2026-08-08)', () => {
    it('is optional — absent means UNKNOWN, and the field is simply not present in the parsed output', () => {
      const parsed = soilReadingCreateSchema.parse({ ...base });
      expect(parsed.wateringRelation).toBeUndefined();
    });

    it('accepts BEFORE and AFTER', () => {
      expect(soilReadingCreateSchema.safeParse({ ...base, wateringRelation: 'BEFORE' }).success).toBe(true);
      expect(soilReadingCreateSchema.safeParse({ ...base, wateringRelation: 'AFTER' }).success).toBe(true);
    });

    it('rejects an unknown value — never silently coerced or dropped', () => {
      expect(
        soilReadingCreateSchema.safeParse({ ...base, wateringRelation: 'DURING' }).success,
      ).toBe(false);
    });
  });
});

describe('instrumentCalibrationSchema', () => {
  it('accepts two ordered anchors', () => {
    const p = instrumentCalibrationSchema.parse({ saturatedValue: 1850, dryValue: 1200 });
    expect(p).toEqual({ saturatedValue: 1850, dryValue: 1200 });
  });

  it('REFUSES a saturated anchor that is not above the dry one — a zero or negative span is not a scale', () => {
    expect(instrumentCalibrationSchema.safeParse({ saturatedValue: 1200, dryValue: 1200 }).success).toBe(false);
    expect(instrumentCalibrationSchema.safeParse({ saturatedValue: 900, dryValue: 1200 }).success).toBe(false);
  });

  // ⚠️ THE SCHEMA ABOVE IS INSTRUMENT-AGNOSTIC AND CANNOT BE ANYTHING ELSE — it never sees an instrument
  // id, so `saturated > dry` is the only rule available to it. That is exactly the gap QA walked through
  // (2026-08-10) with a dry anchor of `-500 g`, accepted end to end with a 200. Keeping this case here,
  // next to the factory's own suite below, so the next reader sees WHY there are two schemas rather than
  // reading the agnostic one as the whole rule.
  it('CANNOT catch a physically impossible anchor on its own — that is the factory\'s job', () => {
    expect(instrumentCalibrationSchema.safeParse({ saturatedValue: 2000, dryValue: -500 }).success)
      .toBe(true);
  });
});

describe('instrumentCalibrationSchemaFor (the anchors bound to ONE instrument\'s scale)', () => {
  it('accepts two ordered anchors that are both real weights', () => {
    const p = instrumentCalibrationSchemaFor('kitchen-scale').parse({
      saturatedValue: 1850, dryValue: 1200,
    });
    expect(p).toEqual({ saturatedValue: 1850, dryValue: 1200 });
  });

  it('REFUSES a negative dry anchor — the exact body QA stored with a 200 OK', () => {
    const r = instrumentCalibrationSchemaFor('kitchen-scale')
      .safeParse({ saturatedValue: 2000, dryValue: -500 });
    expect(r.success).toBe(false);
    // The PATH matters as much as the refusal: it is what lets the browser mark the offending field rather
    // than reporting a whole-form error the owner has to hunt through.
    expect(r.error!.issues.map((i) => i.path.join('.'))).toContain('dryValue');
  });

  it('REFUSES both anchors when both are off the scale, naming each one', () => {
    const r = instrumentCalibrationSchemaFor('kitchen-scale')
      .safeParse({ saturatedValue: -100, dryValue: -200 });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('saturatedValue');
    expect(paths).toContain('dryValue');
  });

  it('still inherits the span rule from the agnostic schema it wraps', () => {
    expect(instrumentCalibrationSchemaFor('kitchen-scale')
      .safeParse({ saturatedValue: 1000, dryValue: 2000 }).success).toBe(false);
    expect(instrumentCalibrationSchemaFor('kitchen-scale')
      .safeParse({ saturatedValue: 1000, dryValue: 1000 }).success).toBe(false);
  });

  // ⚠️ THIS IS AN ACCEPTED LIMIT, PINNED ON PURPOSE — not an oversight anyone should "fix" by inventing a
  // number. `kitchen-scale.rawMax` is null because grams genuinely are open-ended, and no source names a
  // maximum pot mass, so `docs/care-engine.md` §7 forbids shipping a ceiling here. The physically
  // impossible half (a negative mass) IS refused above; the merely implausible half is made visible and
  // correctable by the calibration editor instead. If this test ever goes red, someone added a constant —
  // check that §7.10 carries its ledger row before believing the change.
  it('ACCEPTS an implausibly large anchor — the gram ceiling is open by contract, and stays open', () => {
    expect(instrumentCalibrationSchemaFor('kitchen-scale')
      .safeParse({ saturatedValue: 9007199254740991, dryValue: 1 }).success).toBe(true);
  });

  it('accepts a zero dry anchor — `rawMin: 0` says zero grams is ON the scale', () => {
    expect(instrumentCalibrationSchemaFor('kitchen-scale')
      .safeParse({ saturatedValue: 2000, dryValue: 0 }).success).toBe(true);
  });

  // The whole reason the bound was EXTRACTED rather than re-typed: one implementation, three Zod paths. A
  // value the reading schema refuses must be refused as an anchor too, on every instrument, for free.
  it('binds every instrument to its OWN scale, not the kitchen scale\'s', () => {
    const r = instrumentCalibrationSchemaFor('galvanic-probe')
      .safeParse({ saturatedValue: 11, dryValue: 5 });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join('.'))).toContain('saturatedValue');
  });
});

describe('the Zod layer DERIVES from the table — adding a row needs no edit here', () => {
  // Boundary coverage for these two rows already comes free from the generic loop above (it iterates
  // INSTRUMENT_LIST, so wooden-stick and finger started being covered the moment they entered the table —
  // that is the sharper proof of "no fork"). What that loop does NOT exercise is an interior value parsing
  // end to end for the ORDINAL capture kind, so that is the only thing this case still adds.
  it('accepts a reading from each new ordinal instrument', () => {
    for (const id of ['wooden-stick', 'finger'] as const) {
      const parsed = soilReadingCreateSchema.safeParse({
        instrumentId: id, rawValue: 2, measuredOn: '2026-08-09',
      });
      expect(parsed.success).toBe(true);
    }
  });
});
