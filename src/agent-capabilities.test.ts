import { describe, expect, it } from 'vitest';
import { PROPOSAL_OPERATION_TYPES } from './proposal-operations.js';
import {
  AGENT_SCOPES,
  AGENT_CAPABILITIES,
  mayPropose,
  omittedFieldsFor,
  forbiddenFieldsIn,
  permittedTypesFor,
  assertOmitFieldsAreRealFields,
} from './agent-capabilities.js';

describe('the capability map', () => {
  // Spec §11.3: a NEW operation must not silently default to allowed-for-all or allowed-for-nobody.
  it('classifies every operation type for every scope', () => {
    for (const scope of AGENT_SCOPES) {
      for (const type of PROPOSAL_OPERATION_TYPES) {
        expect(AGENT_CAPABILITIES[scope][type], `${scope} / ${type} is unclassified`).toBeDefined();
      }
    }
  });

  it('has no entry for an operation the union does not define', () => {
    for (const scope of AGENT_SCOPES) {
      for (const type of Object.keys(AGENT_CAPABILITIES[scope])) {
        expect(PROPOSAL_OPERATION_TYPES, `${scope} / ${type} is stale`).toContain(type);
      }
    }
  });
});

describe('the asymmetric and field-level rules', () => {
  it('withholds progress.delete from the gardener and grants it to the doctor', () => {
    expect(mayPropose('doctor', 'progress.delete')).toBe(true);
    expect(mayPropose('gardener', 'progress.delete')).toBe(false);
  });

  it('withholds placeId AND plantId from the doctor at FIELD level, keeping plant.update itself permitted', () => {
    expect(mayPropose('doctor', 'plant.update')).toBe(true);
    expect(omittedFieldsFor('doctor', 'plant.update')).toEqual(['placeId', 'plantId']);
    expect(omittedFieldsFor('gardener', 'plant.update')).toEqual([]);
  });

  it('reports only the withheld fields actually present on the operation', () => {
    expect(forbiddenFieldsIn('doctor', { type: 'plant.update', nickname: 'Randy' } as never)).toEqual([]);
    expect(forbiddenFieldsIn('doctor', { type: 'plant.update', placeId: 'p1' } as never)).toEqual(['placeId']);
    expect(forbiddenFieldsIn('gardener', { type: 'plant.update', placeId: 'p1' } as never)).toEqual([]);
  });

  // The security crux of the per-op plantId change: a doctor token is pinned to one plant, so it may never
  // NAME a plant on any plant-scoped op — the map withholds `plantId` on all seven, and the gardener (which
  // has no pin) is the scope that supplies it. A single missing `omitFields: ['plantId']` here would let a
  // doctor proposal reach another of the owner's plants.
  const PLANT_SCOPED_OPS = ['profile.update', 'plant.update', 'progress.create', 'progress.update', 'frequency.set', 'frequency.clear', 'care.done'] as const;
  it('withholds plantId from the doctor on every plant-scoped op, and grants it to the gardener', () => {
    for (const t of PLANT_SCOPED_OPS) {
      expect(omittedFieldsFor('doctor', t)).toContain('plantId');
      expect(omittedFieldsFor('gardener', t)).not.toContain('plantId');
    }
  });
  it('flags a doctor-supplied plantId as forbidden, but a gardener-supplied one as allowed', () => {
    expect(forbiddenFieldsIn('doctor', { type: 'care.done', plantId: 'pX', task: 'water', occurredOn: '2026-07-24' } as never)).toEqual(['plantId']);
    expect(forbiddenFieldsIn('gardener', { type: 'care.done', plantId: 'pX', task: 'water', occurredOn: '2026-07-24' } as never)).toEqual([]);
  });
});

describe('note.create capability', () => {
  it('is allowed for both scopes', () => {
    expect(mayPropose('doctor', 'note.create')).toBe(true);
    expect(mayPropose('gardener', 'note.create')).toBe(true);
  });
  it('withholds plantId from the doctor and supplies it to the gardener', () => {
    expect(omittedFieldsFor('doctor', 'note.create')).toEqual(['plantId']);
    expect(omittedFieldsFor('gardener', 'note.create')).toEqual([]);
  });
});

describe('an unknown scope denies explicitly instead of crashing', () => {
  // A scope outside AGENT_SCOPES has no row in the map. Indexing straight into it would throw a raw
  // TypeError (a 500 that bypasses classifyFailure's VALIDATION mapping) — and the current callers only
  // avoid hitting this because THEY reject an unrecognized scope first, which is exactly the kind of
  // property that quietly breaks the next time a caller changes. These three assert the map itself fails
  // closed, independent of any caller.
  const unknownScope = 'nonsense' as unknown as (typeof AGENT_SCOPES)[number];

  it('mayPropose denies', () => {
    expect(mayPropose(unknownScope, 'plant.update')).toBe(false);
  });

  it('omittedFieldsFor returns an empty list', () => {
    expect(omittedFieldsFor(unknownScope, 'plant.update')).toEqual([]);
  });

  it('forbiddenFieldsIn returns an empty list', () => {
    expect(forbiddenFieldsIn(unknownScope, { type: 'plant.update', placeId: 'p1' } as never)).toEqual([]);
  });
});

it('the clinical operations are doctor-only', () => {
  expect(AGENT_CAPABILITIES.doctor['clinical_record.create'].allowed).toBe(true);
  expect(AGENT_CAPABILITIES.doctor['clinical_record.update'].allowed).toBe(true);
  for (const scope of Object.keys(AGENT_CAPABILITIES).filter((s) => s !== 'doctor')) {
    expect(AGENT_CAPABILITIES[scope as keyof typeof AGENT_CAPABILITIES]['clinical_record.create'].allowed).toBe(false);
    expect(AGENT_CAPABILITIES[scope as keyof typeof AGENT_CAPABILITIES]['clinical_record.update'].allowed).toBe(false);
  }
});

describe('assertOmitFieldsAreRealFields', () => {
  // The trap this closes: nothing else validates that an `omitFields` entry actually names a field that
  // exists on that operation's schema. A typo (`placeID` for `placeId`) would omit NOTHING, and the field
  // it meant to withhold would still be fully documented downstream, with no error anywhere.
  it('does not throw against the real map (every omitFields entry is a real field, for every scope)', () => {
    expect(() => assertOmitFieldsAreRealFields()).not.toThrow();
  });
});

describe('gardener capability rows (Spec 4 §5.2/§5.3)', () => {
  const GARDEN_OPS = ['place.create', 'place.update', 'city.create', 'city.update', 'plant.create'] as const;
  it('permits every garden operation to the gardener', () => {
    for (const t of GARDEN_OPS) expect(mayPropose('gardener', t)).toBe(true);
  });
  it('withholds every garden operation from the doctor', () => {
    for (const t of GARDEN_OPS) expect(mayPropose('doctor', t)).toBe(false);
  });
  it('withholds progress.delete from the gardener but keeps it for the doctor', () => {
    expect(mayPropose('gardener', 'progress.delete')).toBe(false);
    expect(mayPropose('doctor', 'progress.delete')).toBe(true);
  });
  it('grants plant.update.placeId to the gardener EXCLUSIVELY', () => {
    // ⚠️ The exported helper reports OMITTED fields, so the polarity is INVERTED relative to a
    // "may propose this field?" predicate. Assert the omission set directly — a mechanical rename of a
    // `mayProposeField(...)` call would leave two assertions that are both backwards and both green.
    expect(omittedFieldsFor('gardener', 'plant.update')).toEqual([]);                    // relocation + targeting granted
    expect(omittedFieldsFor('doctor',  'plant.update')).toEqual(['placeId', 'plantId']); // relocation + targeting withheld
  });
});

describe('permittedTypesFor', () => {
  // §4.3 names this the denominator for doc + i18n parity, so both the exclusion and the declaration
  // order it returns in are load-bearing, not incidental.
  it('returns the union-ordered subset each scope may propose', () => {
    expect(permittedTypesFor('doctor')).toEqual([
      'profile.update', 'plant.update', 'progress.create', 'progress.update',
      'progress.delete', 'frequency.set', 'frequency.clear', 'care.done', 'note.create',
      'clinical_record.create', 'clinical_record.update',
    ]);
    expect(permittedTypesFor('gardener')).toEqual([
      'profile.update', 'plant.update', 'progress.create', 'progress.update',
      'frequency.set', 'frequency.clear', 'care.done', 'note.create',
      'place.create', 'place.update', 'city.create', 'city.update', 'plant.create',
    ]);
  });
});
