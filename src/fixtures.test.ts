import { describe, expect, it } from 'vitest';
import { speciesRecordSchema } from './species-record.js';
import curated from './fixtures/curated-records.json' with { type: 'json' };

/**
 * THE TOLERANT-READER REGRESSION.
 *
 * These are the ACTUAL curated rows captured from the local database (aligned with production), in their
 * pre-re-curation shape: every localized free-text field is still a plain English string or array. If the
 * bilingual contract ever stops accepting them, every species page, every care computation and both agent
 * context builders break at once — for every species, not just the one somebody happened to test.
 *
 * Regenerating these fixtures: see Task 6 of
 * docs/superpowers/plans/2026-08-01-species-brief-and-bilingual-catalog.md.
 */
describe('every real curated record still parses through the tolerant reader', () => {
  const rows = curated as { slug: string; record: unknown }[];

  it('captured at least one real row (a zero-row fixture would pass vacuously)', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.map((r) => [r.slug, r.record] as const))('%s parses', (_slug, record) => {
    const parsed = speciesRecordSchema.safeParse(typeof record === 'string' ? JSON.parse(record) : record);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it('normalizes their legacy free text to the { en, es } shape', () => {
    const first = speciesRecordSchema.parse(
      typeof rows[0].record === 'string' ? JSON.parse(rows[0].record) : rows[0].record,
    );
    expect(first.maintenance.pruning).toHaveProperty('en');
    expect(first.maintenance.pruning).toHaveProperty('es');
  });
});
