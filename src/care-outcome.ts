import { z } from 'zod';
import { strictYmd } from './calendar-date.js';

/**
 * ONE DAY, ONE RECORD — the five tasks the rule covers, and the one it deliberately does not.
 *
 * WATER and REPOT already carried the rule (owner rulings 2026-08-10 / spec §8). FERTILIZE, ROTATE and
 * CLEAN_LEAVES join it here. **MIST is excluded on purpose** (owner decision 7): misting twice on a hot day
 * is a genuine, distinct second event, not a duplicate record of one.
 *
 * FERTILIZE's rule is HORTICULTURAL, not hygienic: no plant can healthily be fertilized more than once in a
 * day — the excess is a salt overdose, and accumulated salts cause osmotic stress and root burn. That is why
 * the message the web shows for FERTILIZE warns rather than merely informs.
 *
 * ⚠️ THE RULE IS DAY-SCOPED, NOT TODAY-SCOPED. It dedups against the DAY the submission NAMES
 * (`occurredOn`), whatever day that is — never against the calendar day the request happens to arrive on.
 * A back-dated submission therefore dedups against the day it names. Every description of this rule, in code
 * and in copy, must say "already recorded on that day" and never "already recorded today".
 *
 * This list lives here, in the shared package, because the API enforces it and the web reports it, and a
 * second copy in either is exactly how the two would come to disagree about which tasks have the rule.
 */
export const ONE_PER_DAY_TASKS = ['WATER', 'REPOT', 'FERTILIZE', 'ROTATE', 'CLEAN_LEAVES'] as const;

export type OnePerDayTask = (typeof ONE_PER_DAY_TASKS)[number];

/** Narrows any task string (Prisma's `Task` included) to the five that carry the rule. */
export function isOnePerDayTask(task: string): task is OnePerDayTask {
  return (ONE_PER_DAY_TASKS as readonly string[]).includes(task);
}

/**
 * WHAT THE SUBSTRATE CLOCK ACTUALLY DID — the second, INDEPENDENT outcome a REPOT completion answers with.
 *
 * The substrate anchor (`plants.substrate_refreshed_on` — "when this pot was last filled") only ever moves
 * FORWARD (owner ruling, 2026-08-14; API finding E8). A completion dated strictly BEFORE the stored anchor
 * is still recorded as a real event, but the clock stays where the newer repot put it and no calibrated
 * reading is retracted — so the result has to say which of the two happened, or the reader cannot tell a
 * write from a refusal. That silence is exactly what E8 measured: a duplicate REPOT dragged the anchor 197
 * days backwards and every surface reported an ordinary success.
 *
 * ⚠️ INDEPENDENT OF `CareWriteOutcome`'s `status`, never derived from it. A submission can be BOTH
 * `already-recorded-on-day` AND anchor-`kept` — that combination is the case the API measured. Read the two
 * separately; never infer one from the other.
 *
 * `refreshedOn` is a `YYYY-MM-DD` calendar day — never a timestamp, and never an ISO instant a renderer
 * could shift by a UTC offset. On `refreshed` it is the day the anchor now sits on (the day the caller
 * supplied); on `kept` it is the SURVIVING, strictly NEWER anchor the caller's older day did not displace —
 * which is the value the owner has to be shown, because it is the one fact the write did not change.
 *
 * It lives HERE, in the shared package beside `CareWriteResult`, because the API produces it, the web
 * renders it and the agent proposal mediator stores it: three surfaces, one type expression. It was briefly
 * hand-declared in the API and mirrored in the web (a scheduling compromise while five repos' pinned
 * tarballs were in flight); that fork is closed.
 */
export const substrateAnchorOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('refreshed'), refreshedOn: strictYmd }),
  z.object({ status: z.literal('kept'), refreshedOn: strictYmd }),
]);

export type SubstrateAnchorOutcome = z.infer<typeof substrateAnchorOutcomeSchema>;

/**
 * WHAT A CARE WRITE ACTUALLY DID — the discriminated outcome that replaces a bare success.
 *
 * A second same-day submission still returns SUCCESS and still writes no second `CareEvent` (owner decision
 * 9: a 409 would turn a harmless repeat into an error the owner can do nothing about). What changes is that
 * the result now SAYS SO instead of being indistinguishable from a write.
 *
 * ⚠️ `otherEffectsApplied` IS THE SHARPEST EDGE IN THIS TYPE, and it exists because "no second CareEvent was
 * created" and "nothing was applied" are DIFFERENT CLAIMS. Read it against TWO INDEPENDENT AXES, or you will
 * collapse them back into one and reintroduce the exact defect this paragraph exists to prevent (a fully
 * REFUSED repot once read as "partial" because a reader reasoned from an earlier version of this text):
 *
 *   - whether a `CareEvent` is written at all is decided by the ONE-PER-DAY rule (`ONE_PER_DAY_TASKS` above)
 *     — a second submission naming a day that already has one writes no second `CareEvent`, full stop;
 *   - whether the PROFILE/SUBSTRATE side effects run is decided SEPARATELY, by the day-vs-anchor comparison
 *     (`compareSubstrateAnchor`, `my-plants-api`'s `substrate.write-core.ts`): they run when the submitted
 *     day is NEWER than or EQUAL TO the stored anchor, and they are SKIPPED when the day is STRICTLY OLDER
 *     than the stored anchor (owner ruling, 2026-08-14) — a refused write must never be preceded by a
 *     profile write describing a fill that never became the current one.
 *
 * `otherEffectsApplied` exists ONLY on the `already-recorded-on-day` arm (a fresh `applied` write has no
 * "other" to distinguish from its own primary effect), and reports the SECOND axis: `true` when the day was
 * NOT refused, so the profile write, the substrate refresh and the care-plan recompute still landed even
 * though the `CareEvent` itself was gated — `already-recorded-on-day` then describes THE CARE-EVENT WRITE
 * ONLY, and a surface rendering it must never phrase it as though the whole operation was a no-op. It is now
 * `false` when the submitted day was REFUSED by the anchor comparison (strictly older than the stored
 * anchor): with the profile write skipped too, nothing landed for this submission but the history record —
 * a fully refused repot, not a partial one.
 *
 * ⚠️ `substrate` IS OPTIONAL BY CONSTRUCTION, ON BOTH ARMS, AND ITS ABSENCE IS NOT A DEFAULT. Only a REPOT
 * completion touches the substrate clock, so every other care write legitimately answers nothing about it —
 * and a proposal stored before this field existed replays with it absent. A reader must therefore treat
 * `undefined` as "this write said nothing about the anchor", never as "the anchor was refreshed". It is on
 * BOTH arms rather than only on `already-recorded-on-day` because the pairing is free: a REPOT that DID
 * write its care event can still have had its anchor kept.
 *
 * ⚠️ `potDetailsDiscarded` — THE ONE CASE WHERE WHAT THE OWNER TYPED HAS NOWHERE TO GO (F4,
 * nothing-left-open code review, 2026-08-14). A REPOT completion carries the NEW pot's diameter and soil
 * mix. When the submitted day is strictly OLDER than the stored anchor, the profile write is skipped
 * (Ruling 1 — the event does not describe the pot's current fill), and TWO different things can follow:
 *
 *   - the submission is NOT a same-day duplicate → a `CareEvent` IS written, and the values ride on its own
 *     `payload` (`potDetailsNotApplied`). Nothing is lost: *"recorded as history"* means the history keeps
 *     its own facts. This arm never sets the flag — there is no discard to report;
 *   - the submission is ALSO a same-day duplicate → the one-per-day rule writes NO `CareEvent` at all, so
 *     there is nowhere to attach anything and the values are genuinely gone. THIS is what the flag reports,
 *     and it is not an exotic corner: it is finding E8's own measured 197-day case.
 *
 * ⚠️ IT IS SET BY THE SERVER, AND A READER MUST NOT RE-DERIVE IT. The combination
 * (`already-recorded-on-day` + `otherEffectsApplied: false` + `task: 'REPOT'`) looks like it says the same
 * thing, and it does not: the owner may legitimately submit "I don't know" for BOTH the diameter and the
 * mix, and telling him his pot details were discarded when he typed none would be a false sentence. Only
 * the writer knows whether anything was supplied. This is also the shape that hid E8 — a fact re-derived
 * from a neighbouring value instead of stated.
 *
 * `z.literal(true).optional()` rather than a plain boolean, on purpose: there is no honest `false` to
 * report. Every other outcome either had somewhere to put the values or never carried any, and an explicit
 * `false` would invite a reader to treat its ABSENCE as an assertion rather than as silence — the exact
 * mistake the `substrate` note above exists to prevent.
 */
export const careWriteOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('applied'),
    /** Present only on a REPOT completion — see the `substrate` note above. */
    substrate: substrateAnchorOutcomeSchema.optional(),
  }),
  z.object({
    status: z.literal('already-recorded-on-day'),
    /** WHICH task already had its record on that day. Carried so the reader never has to infer it. */
    task: z.enum(ONE_PER_DAY_TASKS),
    /** THE DAY THE SUBMISSION NAMED, not today — see the day-scoped note on `ONE_PER_DAY_TASKS`. */
    occurredOn: strictYmd,
    /** True when real changes beyond the care event still landed (the REPOT case). */
    otherEffectsApplied: z.boolean(),
    /** Present only on a REPOT completion — see the `substrate` note above. */
    substrate: substrateAnchorOutcomeSchema.optional(),
    /** THE POT DETAILS THE OWNER TYPED WENT NOWHERE — see the long note below. Optional, and its ABSENCE
     *  means "the question does not arise", never "they were applied". */
    potDetailsDiscarded: z.literal(true).optional(),
  }),
]);

export type CareWriteOutcome = z.infer<typeof careWriteOutcomeSchema>;

/** A FRESH object per call — never a shared frozen singleton a caller could accidentally mutate. */
export function appliedOutcome(): CareWriteOutcome {
  return { status: 'applied' };
}

export function alreadyRecordedOutcome(
  task: OnePerDayTask,
  occurredOn: string,
  otherEffectsApplied: boolean,
): CareWriteOutcome {
  return { status: 'already-recorded-on-day', task, occurredOn, otherEffectsApplied };
}

/**
 * THE ONE PLACE A SUBSTRATE OUTCOME IS ATTACHED TO A CARE OUTCOME.
 *
 * The care cores build their outcome long before anyone knows whether the substrate clock moved (only the
 * REPOT path calls the substrate core at all), so the two facts meet at exactly one seam. Making that seam
 * a named function rather than an inline spread is what keeps the "absent means SILENT, not refreshed"
 * rule above true: passing `undefined` writes NO key, so a non-REPOT write can never accidentally persist
 * a `substrate: undefined` that a later reader mistakes for an answer.
 */
export function withSubstrateAnchor(
  outcome: CareWriteOutcome,
  substrate: SubstrateAnchorOutcome | undefined,
): CareWriteOutcome {
  return substrate ? { ...outcome, substrate } : outcome;
}

/**
 * THE ONE PLACE THE "your pot details went nowhere" FLAG IS ATTACHED (F4, 2026-08-14) — the sibling seam to
 * `withSubstrateAnchor`, and for the same reason: passing `false` writes NO key, so an outcome can never
 * accidentally carry a `potDetailsDiscarded: undefined` that a later reader mistakes for an answer.
 *
 * The `already-recorded-on-day` guard is a FACT, not a defensive shrug: the flag exists precisely because
 * that arm writes no `CareEvent`, and on the `applied` arm the values have a home (the event's own payload).
 * A caller that reaches this with an `applied` outcome has not lost anything, so there is nothing to report.
 */
export function withPotDetailsDiscarded(
  outcome: CareWriteOutcome,
  discarded: boolean,
): CareWriteOutcome {
  if (!discarded || outcome.status !== 'already-recorded-on-day') return outcome;
  return { ...outcome, potDetailsDiscarded: true };
}

/**
 * The care-write response envelope. `ok` stays for every existing reader; `outcome` is what the three
 * consumers (the web, any API client, the agent proposal mediator) read to tell a write from a no-op.
 */
export type CareWriteResult = { ok: true; outcome: CareWriteOutcome };

/** The stored, INDEX-ALIGNED-WITH-`operations` array on an applied agent write proposal. */
export const proposalOperationOutcomesSchema = z.array(careWriteOutcomeSchema);

/**
 * The proposal's DERIVED global status. Computed from the per-operation array, **never stored twice** — a
 * second stored copy is a second answer that can disagree with the first.
 */
export const PROPOSAL_OUTCOME_STATUSES = [
  'ALL_APPLIED',
  'PARTIALLY_ALREADY_RECORDED',
  'ALL_ALREADY_RECORDED',
] as const;

export type ProposalOutcomeStatus = (typeof PROPOSAL_OUTCOME_STATUSES)[number];

/**
 * TRUE when an operation's outcome must NOT count toward `ALL_APPLIED` — either its care-event half was
 * swallowed as a same-day duplicate (`already-recorded-on-day`), OR its substrate half carries a `kept`
 * anchor. The second half matters on its own: a REPOT `care.done` (or a `substrate.refresh`) can be a
 * fresh, non-duplicate `applied` write whose day was still older than the stored anchor — nothing moved,
 * no column changed, no audit row recorded that portion — and that is a partial refusal even though
 * `status` alone reads as a plain success (see the `CareWriteOutcome` doc comment: the two facts are read
 * INDEPENDENTLY, never inferred from one another).
 *
 * Exported and written ONCE so the API's consent-surface renderer — and any future consumer of a stored
 * outcome array — shares this exact answer instead of re-deriving it in a second place, which is exactly
 * the fork this shared contract exists to prevent.
 */
export function isProposalOperationNotFullyApplied(outcome: CareWriteOutcome): boolean {
  return outcome.status === 'already-recorded-on-day' || outcome.substrate?.status === 'kept';
}

export function deriveProposalOutcomeStatus(
  outcomes: readonly CareWriteOutcome[],
): ProposalOutcomeStatus {
  const notFullyApplied = outcomes.filter(isProposalOperationNotFullyApplied).length;
  if (notFullyApplied === 0) return 'ALL_APPLIED';
  if (notFullyApplied === outcomes.length) return 'ALL_ALREADY_RECORDED';
  return 'PARTIALLY_ALREADY_RECORDED';
}
