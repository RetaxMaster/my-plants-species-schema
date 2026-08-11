import { z } from 'zod';
import { strictYmd } from './calendar-date.js';
import { INSTRUMENT_IDS, INSTRUMENTS, READING_KINDS, type InstrumentId } from './soil-instrument-constants.js';

// The Zod layer over the instrument property table. Both enums are DERIVED from the Zod-free arrays, so the
// arrays stay the single source of truth and the vocabulary can never fork.
export const instrumentIdEnum = z.enum(INSTRUMENT_IDS);
export const readingKindEnum = z.enum(READING_KINDS);

/**
 * ⚠️ THE RAW VALUE MUST LIE ON THE INSTRUMENT'S OWN DECLARED SCALE (QA finding F5, 2026-08-08).
 *
 * `rawValue` used to be validated as nothing more than a finite number, so `99`, `-50` and `1e9` were all
 * accepted with a 201 on a probe whose printed scale is 1–10. The `[0,1]` wetness invariant still held —
 * `normaliseReading` clamps — and that is exactly what made it dangerous: the owner's own record then
 * stores a raw observation they could not have made, normalised into a perfectly legal fraction that the
 * estimator treats as a real anchor. `docs/care-engine.md` §7.20.2 keeps the clamp as the honest treatment
 * of a reading that is merely NEAR the edge of its scale (a pot weighed with its saucer, a plant that
 * grew); it was never a licence to ACCEPT a value off the scale entirely.
 *
 * The bounds come from the instrument row itself — never a second, hand-written copy per surface — so
 * adding the capacitive/tensiometer rows extends this check with no edit here. `rawMax === null` is
 * OPEN-ENDED by contract (grams), so only the lower bound binds for the kitchen scale; a negative mass is
 * still refused, which is the whole point of the row declaring `rawMin: 0`.
 *
 * EXTRACTED (2026-08-09, code review on 6f4ed3e) so ANY schema carrying an `{ instrumentId, rawValue }`
 * pair can share this ONE rule via `.superRefine(rawValueRangeRefinement)`. `soilReadingCreateSchema`
 * becomes a `ZodEffects` the moment `.superRefine` is chained onto it, so it can no longer be `.pick()`ed
 * apart — a sibling schema (the read-only verdict preview, `my-plants-api`) needs the identical bound
 * without re-typing it. Never paste this function's body a second time: a duplicated range check is
 * precisely the fork that lets a preview answer a question the write would refuse.
 *
 * ⚠️ THE NAME SAYS "RANGE"; SINCE 2026-08-10 IT ENFORCES THE WHOLE DECLARED SCALE — bounds AND granularity
 * (`rawStep`), the latter only where the scale is closed. The name was deliberately NOT changed: it is
 * exported and imported across two repos, and a rename in the middle of a QA fix round is churn that buys
 * nothing a sentence cannot. Read "range" as "the set of values this instrument can actually produce",
 * which is what both halves check.
 */
export function rawValueRangeRefinement(
  v: { instrumentId: InstrumentId; rawValue: number },
  ctx: z.RefinementCtx,
): void {
  const reason = offScaleReason(v.instrumentId, v.rawValue);
  if (reason !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rawValue'], message: `rawValue ${reason}` });
  }
}

/**
 * IS THIS A VALUE THE INSTRUMENT CAN ACTUALLY PRODUCE? Returns why it is not, or `null`.
 *
 * EXTRACTED from `rawValueRangeRefinement` (QA round 3, 2026-08-10) for one reason: a CALIBRATION ANCHOR is
 * a reading on the very same scale — "this pot at container capacity" and "this pot dry" are both weights
 * off the same kitchen scale — so every bound that binds a reading binds an anchor identically. Until this
 * split, the two lived in different worlds: the reading was checked against the instrument row, while
 * `instrumentCalibrationSchema` asked only for two finite numbers with `saturated > dry`. QA saved a DRY
 * ANCHOR OF `-500 g` through the UI and the API, with a `200 OK` and the value echoed back — a pot of
 * negative mass, after which every wetness fraction that pot ever reports is computed off a broken ruler.
 *
 * Returning a REASON STRING rather than a boolean is what lets the one implementation serve three callers
 * that each need a different Zod `path` (`rawValue`, `saturatedValue`, `dryValue`) — the alternative was
 * three copies of the bound, which is exactly the fork this project's guide forbids and exactly how the
 * anchors drifted out of the check in the first place.
 *
 * The message is written to read correctly after ANY of those field names is prefixed to it.
 */
export function offScaleReason(instrumentId: InstrumentId, value: number): string | null {
  const row = INSTRUMENTS[instrumentId];
  if (row === undefined) return null; // an unknown id is caught by instrumentIdEnum itself; nothing to bound against
  const belowMin = value < row.rawMin;
  const aboveMax = row.rawMax !== null && value > row.rawMax;
  if (belowMin || aboveMax) {
    return (
      `${value} is outside the ${instrumentId} scale ` +
      `(${row.rawMin}..${row.rawMax ?? 'open-ended'})`
    );
  }
  return offStepReason(instrumentId, value);
}

/** The granularity half, split out only so `offScaleReason` reads as the two checks it is. */
function offStepReason(instrumentId: InstrumentId, value: number): string | null {
  const row = INSTRUMENTS[instrumentId];
  if (row === undefined) return null;

  // GRANULARITY, and it is enforced ONLY ON A CLOSED SCALE (`rawMax !== null`). QA (2026-08-10) recorded
  // `5.5` on the galvanic probe, whose row declares `rawStep: 1` over a 1..10 index: a reading with more
  // precision than the instrument can physically produce, stored as though it were measured. That is the
  // same class as the out-of-range clamp this refinement was written for — a fabricated number inside a
  // legal-looking range — one digit further in.
  //
  // ⚠️ THE CLOSED-SCALE CONDITION IS THE WHOLE DESIGN, NOT A SHORTCUT. The kitchen scale also declares
  // `rawStep: 1`, but its `rawMax` is `null` because grams are genuinely open-ended, and `1234.5 g` is a
  // perfectly real reading off a real kitchen scale. A naive step check would reject it. `rawMax !== null`
  // is the same "is this scale declared closed" test the range check above already uses for its ceiling, so
  // the two halves cannot drift apart on what "closed" means.
  //
  // The tolerance is not decoration: `(v - min) / step` is floating-point division, so a legitimate value
  // on a fractional step (none ship today, but the contract permits one) would otherwise fail on a
  // representation error rather than on a real one. Scaled to the step so it stays meaningful whatever the
  // step's magnitude.
  if (row.rawMax !== null && row.rawStep > 0) {
    const steps = (value - row.rawMin) / row.rawStep;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      return (
        `${value} is not a whole step on the ${instrumentId} scale ` +
        `(from ${row.rawMin}, in steps of ${row.rawStep})`
      );
    }
  }
  return null;
}

/** What the owner decided AFTER taking the reading (spec §4.8). A verdict maps onto a path that already
 *  exists — a WATER postpone or the existing early-water DONE — never onto a new scheduling rule. */
export const READING_VERDICTS = ['NONE', 'POSTPONE', 'WATER_NOW'] as const;
export type ReadingVerdict = (typeof READING_VERDICTS)[number];
export const readingVerdictEnum = z.enum(READING_VERDICTS);

/**
 * THE ONE VERDICT THAT MEANS "NOTHING WAS DECIDED", named rather than typed as a literal inside
 * `verdictIsAnswer` below. `satisfies ReadingVerdict` is what makes the derivation self-checking: the day
 * this vocabulary is renamed or this member removed, the predicate stops COMPILING instead of quietly
 * classifying every verdict as an answer.
 *
 * Module-private on purpose. Nothing outside needs the value — what the outside needs is the QUESTION the
 * function below answers, and exporting the constant would invite a fourth hand-written `=== 'NONE'`
 * comparison, which is exactly the fork this module exists to prevent.
 */
const NON_ANSWER_VERDICT = 'NONE' satisfies ReadingVerdict;

/**
 * DID THIS VERDICT **ANSWER** THE DAY'S WATERING QUESTION? `'NONE'` is the ABSENCE of an answer, never one
 * of them: it is what a voluntary "Agregar lectura" writes, and what a survey writes when no calibration
 * could interpret the raw value.
 *
 * ⚠️ IT LIVES HERE, IN THE SHARED CONTRACT, BECAUSE THREE CALLERS IN TWO RUNTIMES ASK IT — AND TWO OF THEM
 * ONCE HELD THEIR OWN COPY (hoisted 2026-08-11, code review; docs/care-engine.md §7.20.15/§7.20.17). The
 * three questions are genuinely the same question, asked at three seams:
 *
 *   • the API's READ side (`my-plants-api/src/soil-readings/todays-reading.ts`) — which of a day's readings
 *     speaks for that day, where an answer must outrank a non-answer whatever order they were recorded in;
 *   • the API's WRITE side (`soil-reading.write-core.ts`) — a voluntary edit posting `'NONE'` must not
 *     erase the answer a survey already stored on that same row;
 *   • the WEB (`my-plants-web/utils/waterSurvey.ts`) — the edit dialog has to know whether the row it is
 *     about to replace carries an answer worth restating.
 *
 * Until this hoist the rule existed TWICE — once in the API, once in the web, the web's copy naming the
 * API's as the definition. Both were correct and both were tested, and that is precisely the shape this
 * workspace names as its highest-yield bug class: parallel copies of one rule in two runtimes, where a
 * contract change has to remember both. It is now stated once, beside the vocabulary it is derived from,
 * and imported by every caller.
 *
 * DERIVED FROM THE ONE VERDICT THAT MEANS "NOTHING DECIDED" rather than listed as "the answers", so A
 * FUTURE FOURTH VERDICT IS DECISIVE BY DEFAULT. That is the safe direction, and it is a decision rather
 * than a convenience: a new ANSWER that this function ignored would be a silent regression (the read side
 * would let a non-answer supersede it, the write side would let an edit erase it, and nothing would fail),
 * while a new NON-ANSWER wrongly honoured as an answer is visible the very first time it is used.
 *
 * ⚠️ THE PARAMETER IS `string`, NOT `ReadingVerdict`, AND THAT IS DELIBERATE. The API's read side reduces
 * rows whose `verdict` column arrives as a bare `string` (both of its callers `select` raw columns and do
 * not cast before asking this question), so a narrower parameter would only move the problem: it would buy
 * a compile-time check at one call site by forcing an `as ReadingVerdict` assertion at two others, and an
 * assertion over an unvalidated DB column is a lie the compiler then believes. A `ReadingVerdict` is
 * already a `string`, so the typed callers lose nothing they had; and an unrecognised value is classified
 * as an ANSWER, which is the same safe default the derivation above chooses on purpose.
 */
export function verdictIsAnswer(verdict: string): boolean {
  return verdict !== NON_ANSWER_VERDICT;
}

/** Which side of that day's watering a reading fell on, for a reading taken on a day the plant was ALSO
 *  watered. The drying-rate window is fenced INCLUSIVE of the last watering day, so a row measured on that
 *  exact day reaches the estimator's input seam and this value is what places it.
 *
 *  ⚠️ IT IS AN ADMISSION FILTER, NOTHING MORE. `admitWateringDayRows`
 *  (`my-plants-api/src/care-plan/drying-rate-input.ts`) keeps a row measured on the fenced watering day ONLY
 *  when this column says `AFTER`, and drops it otherwise (`BEFORE` = the previous cycle's tail; `NULL` =
 *  unknown, never guessed). A row measured on any OTHER day is untouched by it. It does NOT designate the
 *  admitted row a "saturated anchor" and it does NOT force `w ≈ 1` — the row's own measured `wetness` is
 *  fitted exactly as stored. Whatever the reading says is what the fit sees.
 *
 *  Owner-ruled 2026-08-08 (ADMIT-and-ASK), SPLIT 2026-08-10 — the question is now asked only where it is
 *  genuinely unanswerable, and the split lives in the API's write core, not here: a reading dated the
 *  plant's own today has its answer DERIVED (`AFTER`) from the watering already on file, a BACK-DATED one is
 *  still asked for (care events store a date, not a time, so nothing recovers the order), and a day with no
 *  watering at all refuses the field and stores `NULL`. `docs/care-engine.md` §7.20.4. */
export const WATERING_RELATIONS = ['BEFORE', 'AFTER'] as const;
export type WateringRelation = (typeof WATERING_RELATIONS)[number];
export const wateringRelationEnum = z.enum(WATERING_RELATIONS);

export const soilReadingCreateSchema = z
  .object({
    instrumentId: instrumentIdEnum,
    /** The RAW instrument value. It is normalised server-side by the instrument's own row; the engine never
     *  sees this number. */
    rawValue: z.number().finite(),
    measuredOn: strictYmd,
    verdict: readingVerdictEnum.default('NONE'),
    /** Required by, and ONLY by, a POSTPONE verdict. */
    postponeToOn: strictYmd.optional(),
    // ⚠️ NO `wateringRelation` HERE, and its absence is the design (owner-ruled 2026-08-10, §7.20.4).
    // A reading dated the plant's own today needs no answer — a watering already recorded for today was
    // recorded BEFORE this moment, so the reading sits inside the cycle that watering opened, and the API
    // DERIVES it. A back-dated reading on a watering day is genuinely unknowable (care events store a
    // date, not a time), so the API asks for it there — through its own DTO, not through this schema,
    // which every surface shares. The enum below stays exported for the column and the read type.
  })
  // Shared, so BOTH layers enforce it: this schema validates the owner's HTTP body at the API edge and is
  // the same module the web imports its bounds from — and now also the SAME function the read-only verdict
  // preview schema calls (`my-plants-api`'s `soil-readings.controller.ts`). Browser-only validation is
  // precisely the class A4 exists to eliminate; a preview that skipped this rule and answered anyway would
  // be the identical class of defect, one layer over.
  .superRefine(rawValueRangeRefinement)
  .superRefine((v, ctx) => {
    if (v.verdict === 'POSTPONE' && v.postponeToOn === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['postponeToOn'],
        message: 'postponeToOn is required when verdict is POSTPONE',
      });
    }
    if (v.verdict !== 'POSTPONE' && v.postponeToOn !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['postponeToOn'],
        message: 'postponeToOn is only meaningful for a POSTPONE verdict',
      });
    }
  });
export type SoilReadingCreate = z.infer<typeof soilReadingCreateSchema>;

/** The per-(plant, instrument) calibration. TWO anchors, because a dimensionless fraction needs two ends:
 *  this pot at container capacity, and this pot dry. A single anchor cannot produce a 0..1 fraction. */
export const instrumentCalibrationSchema = z
  .object({
    saturatedValue: z.number().finite(),
    dryValue: z.number().finite(),
  })
  .refine((v) => v.saturatedValue > v.dryValue, {
    path: ['saturatedValue'],
    message: 'saturatedValue must be strictly greater than dryValue',
  });
export type InstrumentCalibration = z.infer<typeof instrumentCalibrationSchema>;

/**
 * THE SAME CALIBRATION, BOUND TO ONE INSTRUMENT'S SCALE (QA round 3, 2026-08-10).
 *
 * `instrumentCalibrationSchema` above is instrument-AGNOSTIC on purpose — it is the shape, and the shape is
 * two numbers and a positive span. That is genuinely all it can check, because it does not know which
 * instrument the anchors belong to. The consequence, until this factory existed, was that the ONLY rule
 * standing between the owner and a corrupted pot was `saturated > dry`: QA sent `{2000, -500}`, `{2000, 0}`
 * and `{-100, -200}` and every one of them was stored with a `200 OK`.
 *
 * A NEGATIVE MASS IS NOT A TYPO THE ENGINE CAN SURVIVE. The anchors define the affine map from a raw
 * reading to a 0..1 wetness fraction, so a dry anchor of `-500 g` does not fail loudly — it silently
 * rescales every future reading of that pot (a real 1000 g reading reports 60 % wet), and the resulting
 * fractions are all perfectly legal, which is precisely what makes them unfindable afterwards.
 *
 * WHY A FACTORY AND NOT A FIELD: the instrument id lives in the ROUTE (`PUT
 * .../calibration/:instrumentId`), not in the body, and putting it in the body would create a second place
 * for it to be stated and therefore a way for the two to disagree. The caller already knows which
 * instrument it parsed; it passes it here.
 *
 * ⚠️ THE CEILING STAYS OPEN, DELIBERATELY. `INSTRUMENTS['kitchen-scale'].rawMax` is `null` because grams
 * genuinely are open-ended, so this refuses a negative anchor and accepts an absurdly large one. That is
 * not an oversight: no horticultural source names a maximum pot mass, and `docs/care-engine.md` §7 forbids
 * shipping a constant nobody can derive. The physically IMPOSSIBLE half is refused here; the merely
 * implausible half is made visible and correctable instead, by the calibration editor the same fix round
 * added. See §7.20.12.
 */
export function instrumentCalibrationSchemaFor(instrumentId: InstrumentId) {
  return instrumentCalibrationSchema.superRefine((v, ctx) => {
    const saturated = offScaleReason(instrumentId, v.saturatedValue);
    if (saturated !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['saturatedValue'], message: `saturatedValue ${saturated}`,
      });
    }
    const dry = offScaleReason(instrumentId, v.dryValue);
    if (dry !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dryValue'], message: `dryValue ${dry}` });
    }
  });
}
