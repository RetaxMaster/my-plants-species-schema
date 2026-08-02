import { describe, expect, it } from 'vitest';
import {
  REPOT_EVALUATION_ANSWERS,
  repotEvaluationSubmitSchema,
  repotSignContentSchema,
  repotSignDraftSchema,
  repotSignRowSchema,
} from './repot-sign.js';

const content = {
  labelEn: 'Water runs straight through',
  labelEs: 'El agua se escurre de inmediato',
  helpEn: 'Water the pot as usual; if it drains within a second or two, note it.',
  helpEs: null,
};

describe('repotSignContentSchema — labels are authored in BOTH locales or not at all', () => {
  it('accepts a fully bilingual pair', () => {
    expect(repotSignContentSchema.safeParse(content).success).toBe(true);
  });
  it('rejects a blank or whitespace-only labelEs', () => {
    for (const bad of ['', '   ', '\t\n']) {
      expect(repotSignContentSchema.safeParse({ ...content, labelEs: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it('rejects a missing labelEs', () => {
    const { labelEs, ...withoutEs } = content;
    expect(repotSignContentSchema.safeParse(withoutEs).success).toBe(false);
  });
  it('rejects a blank labelEn just as hard', () => {
    expect(repotSignContentSchema.safeParse({ ...content, labelEn: '  ' }).success).toBe(false);
  });
  it('trims labels rather than storing the padding', () => {
    const parsed = repotSignContentSchema.parse({ ...content, labelEn: '  Padded  ' });
    expect(parsed.labelEn).toBe('Padded');
  });
  it('allows help to be null in either locale (help alone has a fallback)', () => {
    expect(repotSignContentSchema.safeParse({ ...content, helpEn: null, helpEs: null }).success).toBe(true);
  });
  it('normalises a blank help to null so the reader never has to test for both', () => {
    expect(repotSignContentSchema.parse({ ...content, helpEs: '   ' }).helpEs).toBeNull();
  });
});

describe('repotSignDraftSchema — what the subagent returns', () => {
  const draft = {
    semanticSlug: 'crowded-clump',
    ...content,
    evidence: 'strong' as const,
    sortOrder: 10,
    rationale: 'Roots displace substrate, so the medium no longer holds water.',
    source: 'https://extension.example.edu/repotting',
  };
  it('accepts a complete draft', () => {
    expect(repotSignDraftSchema.safeParse(draft).success).toBe(true);
  });
  it('requires the classification RATIONALE and a SOURCE — a class with no mechanism does not ship', () => {
    for (const key of ['rationale', 'source'] as const) {
      const { [key]: _dropped, ...without } = draft;
      expect(repotSignDraftSchema.safeParse(without).success, key).toBe(false);
    }
  });
  it('rejects an id-shaped semanticSlug (the subagent proposes the TAIL, never the full id)', () => {
    expect(repotSignDraftSchema.safeParse({ ...draft, semanticSlug: 'spider-plant--crowded-clump' }).success).toBe(false);
  });
  it('rejects an unknown evidence class', () => {
    expect(repotSignDraftSchema.safeParse({ ...draft, evidence: 'important' }).success).toBe(false);
  });
});

describe('repotSignRowSchema — the persisted row', () => {
  const row = {
    id: 'universal--water-runs-through',
    speciesSlug: null,
    ...content,
    evidence: 'strong' as const,
    active: true,
    sortOrder: 10,
  };
  it('accepts a universal row (speciesSlug null)', () => {
    expect(repotSignRowSchema.safeParse(row).success).toBe(true);
  });
  it('accepts a species row', () => {
    expect(repotSignRowSchema.safeParse({ ...row, id: 'spider-plant--crowded-clump', speciesSlug: 'spider-plant' }).success).toBe(true);
  });
  it('rejects a row whose id namespace disagrees with its speciesSlug', () => {
    expect(repotSignRowSchema.safeParse({ ...row, id: 'monstera--x', speciesSlug: 'spider-plant' }).success).toBe(false);
  });
  it('rejects a universal row whose id is not universally namespaced', () => {
    expect(repotSignRowSchema.safeParse({ ...row, id: 'spider-plant--x', speciesSlug: null }).success).toBe(false);
  });
});

describe('repotEvaluationSubmitSchema — the exclusive answer', () => {
  it('lists exactly the three answers', () => {
    expect(REPOT_EVALUATION_ANSWERS).toEqual(['signs', 'no-signs', 'could-not-check']);
  });
  it('accepts { answer: "signs", signIds: [...] }', () => {
    expect(repotEvaluationSubmitSchema.safeParse({ answer: 'signs', signIds: ['universal--water-runs-through'] }).success).toBe(true);
  });
  it('rejects "signs" with an EMPTY signIds — that answer is "no-signs"', () => {
    expect(repotEvaluationSubmitSchema.safeParse({ answer: 'signs', signIds: [] }).success).toBe(false);
  });
  it('rejects a DUPLICATE id', () => {
    const dup = ['universal--water-runs-through', 'universal--water-runs-through'];
    expect(repotEvaluationSubmitSchema.safeParse({ answer: 'signs', signIds: dup }).success).toBe(false);
  });
  it('rejects "no-signs" or "could-not-check" carrying a checked sign — the contradiction is a 400, never silently resolved', () => {
    for (const answer of ['no-signs', 'could-not-check'] as const) {
      expect(repotEvaluationSubmitSchema.safeParse({ answer, signIds: ['universal--water-runs-through'] }).success, answer).toBe(false);
    }
  });
  it('accepts the two bare exclusive answers', () => {
    expect(repotEvaluationSubmitSchema.safeParse({ answer: 'no-signs' }).success).toBe(true);
    expect(repotEvaluationSubmitSchema.safeParse({ answer: 'could-not-check' }).success).toBe(true);
  });
  it('carries NO evidence class — the browser can never weight the calibration', () => {
    expect(
      repotEvaluationSubmitSchema.safeParse({
        answer: 'signs',
        signIds: ['universal--water-runs-through'],
        evidence: 'definitive',
      } as unknown).success,
    ).toBe(false);
  });
});
