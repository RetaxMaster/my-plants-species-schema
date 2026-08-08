import { describe, expect, it } from 'vitest';
import {
  EARLY_WATER_REASONS,
  WATER_POSTPONE_REASONS,
  WATER_FEEDBACK_REASONS,
  JUSTIFIED_EARLY_WATER_REASON,
  JUSTIFIED_POSTPONE_REASON,
  MEASURED_EARLY_WATER_REASON,
  MEASURED_POSTPONE_REASON,
  MEASURED_WATER_REASONS,
  isMeasuredWaterReason,
  REPOT_POSTPONE_REASONS,
  JUSTIFIED_REPOT_REASONS,
  UNJUSTIFIED_REPOT_REASON,
} from './feedback-reason-constants.js';
import { earlyWaterReasonEnum, waterPostponeReasonEnum, repotPostponeReasonEnum } from './feedback-reason.js';

describe('WATER feedback-reason vocabularies', () => {
  it('EARLY_WATER_REASONS is the closed vocabulary, now carrying the MEASURED counterpart', () => {
    expect(EARLY_WATER_REASONS).toEqual(['intuition', 'dry-soil', 'dry-soil-measured']);
  });

  it('WATER_POSTPONE_REASONS is the closed vocabulary, now carrying the MEASURED counterpart', () => {
    expect(WATER_POSTPONE_REASONS).toEqual([
      'soil-still-moist', 'no-time', 'other', 'soil-still-moist-measured',
    ]);
  });

  it('WATER_FEEDBACK_REASONS is exactly the concatenation of the two, in order', () => {
    expect(WATER_FEEDBACK_REASONS).toEqual([...EARLY_WATER_REASONS, ...WATER_POSTPONE_REASONS]);
  });

  it('a MEASURED slug is DISTINCT from its justified counterpart — this is what excludes it from learning', () => {
    expect(MEASURED_EARLY_WATER_REASON).not.toBe(JUSTIFIED_EARLY_WATER_REASON);
    expect(MEASURED_POSTPONE_REASON).not.toBe(JUSTIFIED_POSTPONE_REASON);
  });

  it('MEASURED_WATER_REASONS names both measured slugs, so no caller ever re-types a literal', () => {
    expect([...MEASURED_WATER_REASONS].sort()).toEqual(
      ['dry-soil-measured', 'soil-still-moist-measured'],
    );
    for (const slug of MEASURED_WATER_REASONS) {
      expect((WATER_FEEDBACK_REASONS as readonly string[])).toContain(slug);
    }
  });

  it('isMeasuredWaterReason recognises exactly the measured slugs and nothing else', () => {
    expect(isMeasuredWaterReason('dry-soil-measured')).toBe(true);
    expect(isMeasuredWaterReason('soil-still-moist-measured')).toBe(true);
    expect(isMeasuredWaterReason('dry-soil')).toBe(false);
    expect(isMeasuredWaterReason('soil-still-moist')).toBe(false);
    expect(isMeasuredWaterReason('intuition')).toBe(false);
    expect(isMeasuredWaterReason('not-needed-yet')).toBe(false);
  });

  it('names the two JUSTIFIED slugs (the only reasons that move the cadence) and they are members', () => {
    expect(JUSTIFIED_EARLY_WATER_REASON).toBe('dry-soil');
    expect(JUSTIFIED_POSTPONE_REASON).toBe('soil-still-moist');
    expect(EARLY_WATER_REASONS).toContain(JUSTIFIED_EARLY_WATER_REASON);
    expect(WATER_POSTPONE_REASONS).toContain(JUSTIFIED_POSTPONE_REASON);
  });

  it('every slug is a unique lowercase-kebab token', () => {
    for (const v of WATER_FEEDBACK_REASONS) expect(v).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(new Set(WATER_FEEDBACK_REASONS).size).toBe(WATER_FEEDBACK_REASONS.length);
  });
});

describe('feedback-reason Zod layer', () => {
  it('derives each enum from its array (no fork)', () => {
    expect(earlyWaterReasonEnum.options).toEqual([...EARLY_WATER_REASONS]);
    expect(waterPostponeReasonEnum.options).toEqual([...WATER_POSTPONE_REASONS]);
  });

  it('accepts a valid slug and rejects an unknown one', () => {
    expect(earlyWaterReasonEnum.parse('dry-soil')).toBe('dry-soil');
    expect(waterPostponeReasonEnum.parse('soil-still-moist')).toBe('soil-still-moist');
    expect(earlyWaterReasonEnum.safeParse('soil-still-moist').success).toBe(false); // wrong vocab
    expect(waterPostponeReasonEnum.safeParse('nope').success).toBe(false);
  });
});

describe('REPOT_POSTPONE_REASONS (spec F.3)', () => {
  it('is exactly the three inspection outcomes, in the documented order', () => {
    expect(REPOT_POSTPONE_REASONS).toEqual([
      'not-needed-yet',
      'needed-cannot-now',
      'could-not-check',
    ]);
  });
  it('names the two JUSTIFIED reasons and the single UNJUSTIFIED one', () => {
    expect(JUSTIFIED_REPOT_REASONS).toEqual(['not-needed-yet', 'needed-cannot-now']);
    expect(UNJUSTIFIED_REPOT_REASON).toBe('could-not-check');
  });
  it('shares no slug with the WATER vocabulary (they are distinct reason spaces)', () => {
    for (const r of REPOT_POSTPONE_REASONS) {
      expect(WATER_FEEDBACK_REASONS as readonly string[]).not.toContain(r);
    }
  });
});

describe('repotPostponeReasonEnum (spec F.3)', () => {
  it('accepts every REPOT reason and rejects a WATER one', () => {
    expect(repotPostponeReasonEnum.parse('not-needed-yet')).toBe('not-needed-yet');
    expect(repotPostponeReasonEnum.parse('needed-cannot-now')).toBe('needed-cannot-now');
    expect(repotPostponeReasonEnum.parse('could-not-check')).toBe('could-not-check');
    expect(repotPostponeReasonEnum.safeParse('soil-still-moist').success).toBe(false);
  });
});
