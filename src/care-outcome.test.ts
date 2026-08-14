import { describe, expect, it } from 'vitest';
import {
  ONE_PER_DAY_TASKS,
  alreadyRecordedOutcome,
  appliedOutcome,
  careWriteOutcomeSchema,
  deriveProposalOutcomeStatus,
  isOnePerDayTask,
  proposalOperationOutcomesSchema,
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
