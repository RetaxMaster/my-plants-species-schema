import { describe, expect, it } from 'vitest';
import {
  ONE_PER_DAY_TASKS,
  alreadyRecordedOutcome,
  appliedOutcome,
  careWriteOutcomeSchema,
  deriveProposalOutcomeStatus,
  isOnePerDayTask,
  proposalOperationOutcomesSchema,
  substrateAnchorOutcomeSchema,
  withSubstrateAnchor,
} from './care-outcome.js';

describe('ONE_PER_DAY_TASKS', () => {
  it('names the five tasks the rule covers and EXCLUDES MIST (owner decision 7)', () => {
    expect([...ONE_PER_DAY_TASKS]).toEqual(['WATER', 'REPOT', 'FERTILIZE', 'ROTATE', 'CLEAN_LEAVES']);
    expect(isOnePerDayTask('MIST')).toBe(false);
    expect(isOnePerDayTask('PROGRESS')).toBe(false);
    expect(isOnePerDayTask('WATER')).toBe(true);
  });
});

describe('careWriteOutcomeSchema', () => {
  it('accepts the applied arm', () => {
    expect(careWriteOutcomeSchema.parse({ status: 'applied' })).toEqual({ status: 'applied' });
  });

  it('accepts the already-recorded arm, which NAMES the task and the DAY it dedups against', () => {
    const parsed = careWriteOutcomeSchema.parse({
      status: 'already-recorded-on-day',
      task: 'FERTILIZE',
      occurredOn: '2026-08-01',
      otherEffectsApplied: false,
    });
    expect(parsed).toEqual({
      status: 'already-recorded-on-day',
      task: 'FERTILIZE',
      occurredOn: '2026-08-01',
      otherEffectsApplied: false,
    });
  });

  it('rejects MIST in the already-recorded arm — MIST has no one-per-day rule', () => {
    expect(
      careWriteOutcomeSchema.safeParse({
        status: 'already-recorded-on-day',
        task: 'MIST',
        occurredOn: '2026-08-01',
        otherEffectsApplied: false,
      }).success,
    ).toBe(false);
  });

  it('rejects an impossible calendar day — the day is a strict YMD, never a free string', () => {
    expect(
      careWriteOutcomeSchema.safeParse({
        status: 'already-recorded-on-day',
        task: 'WATER',
        occurredOn: '2026-02-31',
        otherEffectsApplied: false,
      }).success,
    ).toBe(false);
  });
});

describe('the constructors', () => {
  it('appliedOutcome() returns a FRESH object each call — never a shared mutable singleton', () => {
    const a = appliedOutcome();
    const b = appliedOutcome();
    expect(a).toEqual({ status: 'applied' });
    expect(a).not.toBe(b);
  });

  it('alreadyRecordedOutcome carries otherEffectsApplied verbatim — REPOT ran real side effects', () => {
    expect(alreadyRecordedOutcome('REPOT', '2026-08-01', true)).toEqual({
      status: 'already-recorded-on-day',
      task: 'REPOT',
      occurredOn: '2026-08-01',
      otherEffectsApplied: true,
    });
  });
});

describe('deriveProposalOutcomeStatus', () => {
  const applied = appliedOutcome();
  const already = alreadyRecordedOutcome('WATER', '2026-08-01', false);

  it('ALL_APPLIED when nothing was deduped', () => {
    expect(deriveProposalOutcomeStatus([applied, applied])).toBe('ALL_APPLIED');
  });

  it('ALL_ALREADY_RECORDED when every operation was deduped', () => {
    expect(deriveProposalOutcomeStatus([already, already])).toBe('ALL_ALREADY_RECORDED');
  });

  it('PARTIALLY_ALREADY_RECORDED for a mixed multi-operation proposal', () => {
    expect(deriveProposalOutcomeStatus([applied, already])).toBe('PARTIALLY_ALREADY_RECORDED');
  });

  it('an empty array is ALL_APPLIED — nothing was swallowed', () => {
    expect(deriveProposalOutcomeStatus([])).toBe('ALL_APPLIED');
  });
});

describe('proposalOperationOutcomesSchema', () => {
  it('parses a stored, index-aligned array', () => {
    const stored = JSON.stringify([appliedOutcome(), alreadyRecordedOutcome('ROTATE', '2026-08-02', false)]);
    expect(proposalOperationOutcomesSchema.parse(JSON.parse(stored))).toHaveLength(2);
  });

  it('rejects a malformed stored array rather than trusting the column', () => {
    expect(proposalOperationOutcomesSchema.safeParse([{ status: 'nope' }]).success).toBe(false);
  });
});

describe('substrateAnchorOutcomeSchema', () => {
  it('accepts both arms, and the day is a strict calendar day', () => {
    expect(substrateAnchorOutcomeSchema.parse({ status: 'refreshed', refreshedOn: '2026-08-14' })).toEqual({
      status: 'refreshed',
      refreshedOn: '2026-08-14',
    });
    expect(substrateAnchorOutcomeSchema.parse({ status: 'kept', refreshedOn: '2026-03-01' })).toEqual({
      status: 'kept',
      refreshedOn: '2026-03-01',
    });
    expect(substrateAnchorOutcomeSchema.safeParse({ status: 'kept', refreshedOn: '2026-02-31' }).success).toBe(false);
    expect(substrateAnchorOutcomeSchema.safeParse({ status: 'moved', refreshedOn: '2026-03-01' }).success).toBe(false);
  });
});

/**
 * THE FORK THIS FILE EXISTS TO PREVENT (finding E8's agent-facing half).
 *
 * `careWriteOutcomeSchema` is a zod object union, so it STRIPS keys it does not declare. While
 * `SubstrateAnchorOutcome` was hand-declared in the API and mirrored in the web, an anchor outcome attached
 * to a stored per-operation array survived the write and then VANISHED on the read back — the agent and the
 * approving owner saw an ordinary success on precisely the write that refused to move the clock.
 *
 * ⚠️ EVERY ASSERTION BELOW IS PAIRED WITH A POSITIVE CONTROL. "the anchor is not stripped" is an absence
 * claim, and an absence claim is satisfied by a world where nothing ran at all — so each case first proves
 * the array was populated and the surrounding outcome round-tripped, and only then reads the anchor.
 */
describe('the substrate anchor SURVIVES the shared outcome contract end to end', () => {
  const kept = { status: 'kept', refreshedOn: '2026-03-01' } as const;
  const refreshed = { status: 'refreshed', refreshedOn: '2026-08-14' } as const;

  it('survives careWriteOutcomeSchema on the applied arm', () => {
    const parsed = careWriteOutcomeSchema.parse({ status: 'applied', substrate: refreshed });
    // POSITIVE CONTROL — the parse produced a real outcome, so the anchor assertion below is about
    // stripping and not about an empty result.
    expect(parsed.status).toBe('applied');
    expect(parsed.substrate).toEqual(refreshed);
  });

  it('survives careWriteOutcomeSchema on the already-recorded arm — the E8 pairing', () => {
    const parsed = careWriteOutcomeSchema.parse({
      status: 'already-recorded-on-day',
      task: 'REPOT',
      occurredOn: '2026-08-14',
      otherEffectsApplied: true,
      substrate: kept,
    });
    // POSITIVE CONTROL — the whole already-recorded payload round-tripped.
    expect(parsed).toMatchObject({
      status: 'already-recorded-on-day',
      task: 'REPOT',
      occurredOn: '2026-08-14',
      otherEffectsApplied: true,
    });
    expect(parsed.substrate).toEqual(kept);
  });

  it('survives the STORED, agent-facing per-operation array — JSON round trip and all', () => {
    const stored = JSON.stringify([
      withSubstrateAnchor(alreadyRecordedOutcome('REPOT', '2026-08-14', true), kept),
      withSubstrateAnchor(appliedOutcome(), undefined),
    ]);
    const parsed = proposalOperationOutcomesSchema.parse(JSON.parse(stored));
    // POSITIVE CONTROL — the array is index-aligned and populated; an empty array would satisfy every
    // "no anchor was lost" phrasing below while proving nothing.
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.status).toBe('already-recorded-on-day');
    expect(parsed[1]!.status).toBe('applied');

    expect(parsed[0]!.substrate).toEqual(kept);
    // A non-REPOT operation says NOTHING about the anchor — absent, never a fabricated 'refreshed'.
    expect(parsed[1]!.substrate).toBeUndefined();
  });

  it('withSubstrateAnchor writes NO key when there is nothing to say', () => {
    const outcome = withSubstrateAnchor(appliedOutcome(), undefined);
    expect(outcome).toEqual({ status: 'applied' });
    expect('substrate' in outcome).toBe(false);
  });

  it('withSubstrateAnchor does not mutate the outcome it was handed', () => {
    const original = appliedOutcome();
    const carried = withSubstrateAnchor(original, kept);
    expect(carried.substrate).toEqual(kept);
    expect(original).toEqual({ status: 'applied' });
  });
});
