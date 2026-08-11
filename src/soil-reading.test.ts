import { z } from 'zod';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  instrumentIdEnum,
  readingKindEnum,
  soilReadingCreateSchema,
  instrumentCalibrationSchema,
  instrumentCalibrationSchemaFor,
  implausibleForPotReason,
  READING_PLAUSIBLE_SPANS_ABOVE_SATURATED,
  READING_PLAUSIBLE_SPANS_BELOW_DRY,
  rawValueRangeRefinement,
  wateringRelationEnum,
  WATERING_RELATIONS,
  READING_VERDICTS,
  verdictIsAnswer,
  type SoilReadingCreate,
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

// ---------------------------------------------------------------------------------------------------
// `verdictIsAnswer` — ONE definition, three callers, two runtimes (hoisted here 2026-08-11).
//
// It lived TWICE before this: `my-plants-api/src/soil-readings/todays-reading.ts` (the read side, and
// since QA finding 6 the write side too) and `my-plants-web/utils/waterSurvey.ts` (the edit dialog). Both
// copies were correct and both were tested — which is exactly why the fork was worth removing rather than
// worth watching: nothing would have gone red the day one of them changed.
// ---------------------------------------------------------------------------------------------------
describe('verdictIsAnswer', () => {
  // ⚠️ MUTATION THIS PINS (direction: NOT UNDER-BROAD). Hard-code `return false`, or add `'WATER_NOW'` /
  // `'POSTPONE'` to the non-answer side, and this case goes red. Without it the read side would let an
  // evening voluntary log supersede the morning survey's answer, and the write side would let an edit
  // erase it.
  it('counts a real decision as an answer', () => {
    expect(verdictIsAnswer('WATER_NOW')).toBe(true);
    expect(verdictIsAnswer('POSTPONE')).toBe(true);
  });

  // ⚠️ MUTATION THIS PINS (direction: NOT OVER-BROAD). Hard-code `return true` — or flip the comparison to
  // `===` — and this case goes red. Without it every voluntary log would count as an answer, which is the
  // live defect the 2026-08-11 one-reading-per-day ruling closed: storing a measurement would silently
  // answer a question nobody had asked.
  it('counts "nothing decided" as the ABSENCE of an answer, never one of them', () => {
    expect(verdictIsAnswer('NONE')).toBe(false);
  });

  // The derivation, asserted as a derivation. Every member of the vocabulary EXCEPT `'NONE'` is an answer,
  // read off `READING_VERDICTS` itself rather than re-listed here — so adding a fourth verdict to the
  // array without deciding what it means makes this case speak up, in the safe direction the function's
  // own comment argues for.
  it('treats every verdict except "NONE" as an answer, derived from the vocabulary itself', () => {
    expect(READING_VERDICTS.filter((v) => !verdictIsAnswer(v))).toEqual(['NONE']);
  });

  // ⚠️ THE SAFE DEFAULT, PINNED. An unrecognised value — a verdict written by a future version, a column
  // read from a row this build does not know about — is an ANSWER. A new answer silently ignored is an
  // invisible regression; a new non-answer wrongly honoured shows up the first time it is used. This case
  // is what stops a well-meaning "unknown means nothing decided" rewrite from inverting that choice.
  it('classifies an unrecognised verdict as an answer, never as the absence of one', () => {
    expect(verdictIsAnswer('SOME_FUTURE_VERDICT')).toBe(true);
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

  // ⚠️ RETIRED FROM THE WRITE PATH 2026-08-10 (owner-ruled). This block used to assert that
  // `soilReadingCreateSchema` ACCEPTS `wateringRelation`. It no longer travels on the wire: the API derives
  // it for a today-dated reading and asks for it only on a back-dated one, where the API's own DTO carries
  // it. The VOCABULARY stays exported, because the database column, the read type and that voluntary write
  // all still need it — see docs/care-engine.md §7.20.4.
  describe('wateringRelation is no longer part of the create contract', () => {
    // COMPILE-TIME assertion: this is the guarantee that actually matters to the five consumer repos. A
    // runtime-only check (Zod stripping an unrecognised key) would pass identically for a typo'd key name
    // or a rename — it proves Zod's default strip mechanic, not that THIS field was deliberately excluded.
    // `expectTypeOf(...).not.toHaveProperty(...)` fails to COMPILE if `wateringRelation` is ever re-added
    // to `SoilReadingCreate`, which is the thing every consumer actually depends on.
    it('SoilReadingCreate no longer offers the key, at the type level', () => {
      expectTypeOf<SoilReadingCreate>().not.toHaveProperty('wateringRelation');
    });

    it('an unrecognised wateringRelation is stripped, and the rest of the parse still succeeds intact', () => {
      const parsed = soilReadingCreateSchema.parse({ ...base, wateringRelation: 'AFTER' });
      expect(parsed).not.toHaveProperty('wateringRelation');
      // Guards against a future edit breaking the WHOLE schema rather than just this field — this must
      // fail if `parse` starts throwing, dropping a known field, or returning a stale default.
      expect(parsed).toEqual({ ...base, verdict: 'NONE' });
    });

    // WATERING_RELATIONS / wateringRelationEnum are already asserted verbatim by
    // `describe('the Zod layer is DERIVED from the constant arrays (no fork)')` above — not re-asserted
    // here to avoid duplicate coverage that could silently drift from that block.
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// `implausibleForPotReason` — QA round 4, DEF-4 (LOW, confirmed reproducible).
//
// The complaint QA measured: with a pot calibrated `watered 2000 g / dry 1500 g`, `99999999` grams SAVED,
// clamped to 100 % moisture and rescheduled the watering; `0` and `12.7` were accepted with no message
// either. The galvanic probe validated properly, because its scale is CLOSED — so this gap was exactly the
// one instrument whose `rawMax` is `null` by contract, and the fix had to come from the pot rather than
// from the instrument table.
//
// ⚠️ THE TEST FILE THAT PINS THE BAND IN BOTH DIRECTIONS. A guard is easy to write so wide it can never
// fire; each block below therefore states BOTH what is refused and what is still ACCEPTED right next to it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('implausibleForPotReason (QA round 4, DEF-4)', () => {
  // The pot from QA's own repro. span = 500 g, so the band is [1500 - 500, 2000 + 2*500] = [1000, 3000].
  const pot = { saturatedValue: 2000, dryValue: 1500 };

  it('refuses the three values QA saved with a 201', () => {
    for (const absurd of [99999999, 0, 12.7]) {
      expect(implausibleForPotReason(absurd, pot)).not.toBeNull();
    }
  });

  it('refuses the order-of-magnitude typos in both directions', () => {
    expect(implausibleForPotReason(150, pot)).not.toBeNull(); // a dropped zero
    expect(implausibleForPotReason(20000, pot)).not.toBeNull(); // an extra one
  });

  // ⚠️ THE HALF THAT MATTERS MOST, AND THE ONE A CARELESS GUARD BREAKS. A real pot leaves its anchors: it
  // is heavier than "watered" right after a deep watering (or with runoff standing in its saucer), and
  // lighter than "dry" in a heatwave, because "dry" is the owner's time-to-water weight and not bone dry.
  // Tightening either constant to 0 — i.e. clamping the band at the anchors — turns every case here RED.
  it('ACCEPTS honest readings outside the anchors, which is what the band is generous FOR', () => {
    expect(implausibleForPotReason(2400, pot)).toBeNull(); // just watered, saucer caught the runoff
    expect(implausibleForPotReason(1200, pot)).toBeNull(); // a heatwave took it past the dry anchor
    expect(implausibleForPotReason(2600, pot)).toBeNull(); // a plant that grew since calibration
  });

  // The boundary is a DECISION, not an accident of which operator was typed: the band is INCLUSIVE at both
  // ends, matching `offScaleReason`'s own inclusive `rawMin`/`rawMax` treatment directly above.
  it('is inclusive at both ends, and refuses one step beyond each', () => {
    expect(implausibleForPotReason(1000, pot)).toBeNull();
    expect(implausibleForPotReason(3000, pot)).toBeNull();
    expect(implausibleForPotReason(999.9, pot)).not.toBeNull();
    expect(implausibleForPotReason(3000.1, pot)).not.toBeNull();
  });

  // ⚠️ THE ASYMMETRY IS THE PHYSICS, AND THIS IS WHAT SAYS SO. Mass can be ADDED to a pot without a natural
  // ceiling (water, runoff, growth); it can only be REMOVED down to solids that do not evaporate. Making
  // the two constants equal in EITHER direction turns one of these two cases red.
  it('allows twice as far above the saturated anchor as below the dry one', () => {
    expect(READING_PLAUSIBLE_SPANS_ABOVE_SATURATED).toBe(2 * READING_PLAUSIBLE_SPANS_BELOW_DRY);
    expect(implausibleForPotReason(2000 + 2 * 500, pot)).toBeNull(); // two spans up: fine
    expect(implausibleForPotReason(1500 - 2 * 500, pot)).not.toBeNull(); // two spans down: refused
  });

  // NO CALIBRATION, NO RULER — and that is not a hole. An instrument that needs no anchors is already fully
  // bounded by its own declared scale (`offScaleReason`), and one that needs them but has none yields a
  // NULL wetness the estimator skips: honest, and it must stay recordable. Returning a reason here would
  // block a reading the contract deliberately accepts.
  it('judges nothing without a calibration', () => {
    expect(implausibleForPotReason(99999999, null)).toBeNull();
    expect(implausibleForPotReason(99999999, undefined)).toBeNull();
  });

  // A degenerate span is refused at the CALIBRATION seam (`instrumentCalibrationSchemaFor`); bounding a
  // value against a ruler of zero length is not a check, so this one declines to answer rather than
  // dividing by nothing.
  it('judges nothing against a degenerate span', () => {
    expect(implausibleForPotReason(99999999, { saturatedValue: 2000, dryValue: 2000 })).toBeNull();
  });

  // The message has to read correctly after `rawValue` is prefixed to it — the same contract
  // `offScaleReason`'s message carries, because both are surfaced through the same 400.
  it('names both anchors and the expected band, so the owner can act on it', () => {
    const reason = implausibleForPotReason(99999999, pot)!;
    expect(`rawValue ${reason}`).toContain('rawValue 99999999 is not a plausible reading for this pot');
    expect(reason).toContain('1500 (dry)');
    expect(reason).toContain('2000 (watered)');
    expect(reason).toContain('between 1000 and 3000');
  });
});
