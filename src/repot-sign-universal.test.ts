import { describe, expect, it } from 'vitest';
import { repotSignRowSchema } from './repot-sign.js';
import { UNIVERSAL_REPOT_SIGNS, UNIVERSAL_REPOT_SIGN_SEMANTIC_SLUGS } from './repot-sign-universal.js';

describe('UNIVERSAL_REPOT_SIGNS', () => {
  it('is non-empty — a not-yet-re-cured species must still get a usable questionnaire', () => {
    expect(UNIVERSAL_REPOT_SIGNS.length).toBeGreaterThan(0);
  });
  it('every row satisfies the persisted row contract', () => {
    for (const row of UNIVERSAL_REPOT_SIGNS) {
      const parsed = repotSignRowSchema.safeParse(row);
      expect(parsed.success, `${row.id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });
  it('every row is universal (speciesSlug null, universal-namespaced id) and active', () => {
    for (const row of UNIVERSAL_REPOT_SIGNS) {
      expect(row.speciesSlug).toBeNull();
      expect(row.id.startsWith('universal--')).toBe(true);
      expect(row.active).toBe(true);
    }
  });
  it('has no duplicate ids and no duplicate sortOrder', () => {
    expect(new Set(UNIVERSAL_REPOT_SIGNS.map((r) => r.id)).size).toBe(UNIVERSAL_REPOT_SIGNS.length);
    expect(new Set(UNIVERSAL_REPOT_SIGNS.map((r) => r.sortOrder)).size).toBe(UNIVERSAL_REPOT_SIGNS.length);
  });
  it('exposes its semantic slugs for the KE double-count check', () => {
    expect([...UNIVERSAL_REPOT_SIGN_SEMANTIC_SLUGS].sort()).toEqual(
      UNIVERSAL_REPOT_SIGNS.map((r) => r.id.slice('universal--'.length)).sort(),
    );
  });
  it('is pot physics only — it never names a species-specific structure', () => {
    for (const row of UNIVERSAL_REPOT_SIGNS) {
      expect(`${row.labelEn} ${row.labelEs}`.toLowerCase()).not.toMatch(/clump|frond|pseudobulb|offset/);
    }
  });
  it('classifies the hydraulic sign STRONG and the lone exploratory root SUGGESTIVE', () => {
    const byId = new Map(UNIVERSAL_REPOT_SIGNS.map((r) => [r.id, r] as const));
    expect(byId.get('universal--water-runs-through')?.evidence).toBe('strong');
    expect(byId.get('universal--single-root-at-drainage-hole')?.evidence).toBe('suggestive');
    expect(byId.get('universal--pot-split-or-deformed')?.evidence).toBe('definitive');
  });
});
