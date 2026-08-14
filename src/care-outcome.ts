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
 * WHAT A CARE WRITE ACTUALLY DID — the discriminated outcome that replaces a bare success.
 *
 * A second same-day submission still returns SUCCESS and still writes no second `CareEvent` (owner decision
 * 9: a 409 would turn a harmless repeat into an error the owner can do nothing about). What changes is that
 * the result now SAYS SO instead of being indistinguishable from a write.
 *
 * ⚠️ `otherEffectsApplied` IS THE SHARPEST EDGE IN THIS TYPE, and it exists because "no second CareEvent was
 * created" and "nothing was applied" are DIFFERENT CLAIMS — and for REPOT the second is FALSE. On a duplicate
 * REPOT completion the profile write, the substrate refresh and the care-plan recompute all still run
 * unconditionally; only the `CareEvent` write is gated. So `already-recorded-on-day` describes THE CARE-EVENT
 * WRITE ONLY, and any surface rendering it must never phrase it as though the whole operation was a no-op
 * when `otherEffectsApplied` is true.
 */
export const careWriteOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('applied') }),
  z.object({
    status: z.literal('already-recorded-on-day'),
    /** WHICH task already had its record on that day. Carried so the reader never has to infer it. */
    task: z.enum(ONE_PER_DAY_TASKS),
    /** THE DAY THE SUBMISSION NAMED, not today — see the day-scoped note on `ONE_PER_DAY_TASKS`. */
    occurredOn: strictYmd,
    /** True when real changes beyond the care event still landed (the REPOT case). */
    otherEffectsApplied: z.boolean(),
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

export function deriveProposalOutcomeStatus(
  outcomes: readonly CareWriteOutcome[],
): ProposalOutcomeStatus {
  const already = outcomes.filter((o) => o.status === 'already-recorded-on-day').length;
  if (already === 0) return 'ALL_APPLIED';
  if (already === outcomes.length) return 'ALL_ALREADY_RECORDED';
  return 'PARTIALLY_ALREADY_RECORDED';
}
