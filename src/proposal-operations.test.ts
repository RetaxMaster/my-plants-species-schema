import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  operationSchema,
  createProposalSchema,
  findOverlappingWriteSet,
  serializedBytes,
  MAX_OPERATIONS,
  MAX_CLINICAL_BODY_CHARS,
  MAX_SERIALIZED_BYTES,
  PROPOSAL_OPERATION_TYPES,
  discriminatedUnionMembers,
  type ProposalOperation,
} from './proposal-operations.js';
import { NOTE_MAX_LEN } from './care-operations-constants.js';

describe('operationSchema', () => {
  it('accepts a valid care.done', () => {
    expect(operationSchema.safeParse({ type: 'care.done', task: 'WATER', occurredOn: '2026-07-16' }).success).toBe(true);
  });
  it('rejects PROGRESS as a frequency task', () => {
    expect(operationSchema.safeParse({ type: 'frequency.clear', task: 'PROGRESS' }).success).toBe(false);
  });
  it('rejects an unknown property (strict)', () => {
    expect(operationSchema.safeParse({ type: 'progress.delete', entryId: 'e1', extra: 1 }).success).toBe(false);
  });
  it('rejects a patch operation that writes nothing (superRefine)', () => {
    expect(operationSchema.safeParse({ type: 'plant.update' }).success).toBe(false);
  });
  it('rejects an ISO instant for a date field', () => {
    expect(operationSchema.safeParse({ type: 'care.done', task: 'WATER', occurredOn: '2026-07-16T00:00:00Z' }).success).toBe(false);
  });
  it('accepts a relocation-only plant.update (placeId is a WRITE field, not identity)', () => {
    expect(operationSchema.safeParse({ type: 'plant.update', placeId: 'PLACE_1' }).success).toBe(true);
  });
  it('rejects an identity-only progress.update (entryId is IDENTITY here, not a write field)', () => {
    expect(operationSchema.safeParse({ type: 'progress.update', entryId: 'e1' }).success).toBe(false);
  });
  it('accepts a gardener-targeted plant.update (plantId names the target, placeId is the write)', () => {
    expect(operationSchema.safeParse({ type: 'plant.update', plantId: 'PLANT_1', placeId: 'PLACE_1' }).success).toBe(true);
  });
  it('rejects a plant.update carrying ONLY plantId (plantId is identity, not a write field)', () => {
    expect(operationSchema.safeParse({ type: 'plant.update', plantId: 'PLANT_1' }).success).toBe(false);
  });
  it('accepts a gardener-targeted care.done (plantId selects the plant)', () => {
    expect(operationSchema.safeParse({ type: 'care.done', plantId: 'PLANT_1', task: 'WATER', occurredOn: '2026-07-24' }).success).toBe(true);
  });
  it('accepts a plant.memorialize with no plantId (doctor-pinned)', () => {
    expect(operationSchema.safeParse({ type: 'plant.memorialize' }).success).toBe(true);
  });
  it('accepts a plant.gift naming a target plant (gardener)', () => {
    expect(operationSchema.safeParse({ type: 'plant.gift', plantId: 'PLANT_1' }).success).toBe(true);
  });
  it('rejects extra fields on a lifecycle op (strict)', () => {
    expect(operationSchema.safeParse({ type: 'plant.memorialize', placeId: 'P' }).success).toBe(false);
  });
});

describe('findOverlappingWriteSet', () => {
  it('returns the overlap key for two ops on the same frequency task', () => {
    expect(findOverlappingWriteSet([
      { type: 'frequency.set', task: 'WATER', intervalDays: 7 },
      { type: 'frequency.clear', task: 'WATER' },
    ] as ProposalOperation[])).toBe('frequency:WATER');
  });
  it('returns null when nothing overlaps', () => {
    expect(findOverlappingWriteSet([
      { type: 'frequency.set', task: 'WATER', intervalDays: 7 },
      { type: 'care.done', task: 'FERTILIZE', occurredOn: '2026-07-16' },
    ] as ProposalOperation[])).toBeNull();
  });
  it('returns the overlap key for progress.update and progress.delete on the same entryId', () => {
    expect(findOverlappingWriteSet([
      { type: 'progress.update', entryId: 'e1', health: 'GOOD' },
      { type: 'progress.delete', entryId: 'e1' },
    ] as ProposalOperation[])).toBe('entry:e1');
  });
  it('returns the overlap key for two care.done on the same task and date', () => {
    expect(findOverlappingWriteSet([
      { type: 'care.done', task: 'WATER', occurredOn: '2026-07-16' },
      { type: 'care.done', task: 'WATER', occurredOn: '2026-07-16' },
    ] as ProposalOperation[])).toBe('care:WATER:2026-07-16');
  });
  it('returns the overlap key for two plant.update ops touching the same field', () => {
    expect(findOverlappingWriteSet([
      { type: 'plant.update', nickname: 'Fern' },
      { type: 'plant.update', nickname: 'Randy' },
    ] as ProposalOperation[])).toBe('plant:nickname');
  });
  it('does NOT collide two plant-scoped ops on the same field for DIFFERENT plants (gardener batch)', () => {
    expect(findOverlappingWriteSet([
      { type: 'plant.update', plantId: 'PLANT_1', nickname: 'Fern' },
      { type: 'plant.update', plantId: 'PLANT_2', nickname: 'Randy' },
    ] as ProposalOperation[])).toBeNull();
    expect(findOverlappingWriteSet([
      { type: 'frequency.set', plantId: 'PLANT_1', task: 'WATER', intervalDays: 7 },
      { type: 'frequency.set', plantId: 'PLANT_2', task: 'WATER', intervalDays: 5 },
    ] as ProposalOperation[])).toBeNull();
  });
  it('DOES collide two plant-scoped ops on the same field for the SAME plant (plantId in the key)', () => {
    expect(findOverlappingWriteSet([
      { type: 'frequency.set', plantId: 'PLANT_1', task: 'WATER', intervalDays: 7 },
      { type: 'frequency.clear', plantId: 'PLANT_1', task: 'WATER' },
    ] as ProposalOperation[])).toBe('frequency:PLANT_1:WATER');
  });
  it('returns null for two progress.create ops — a create has no pre-existing target, so creates never collide', () => {
    expect(findOverlappingWriteSet([
      { type: 'progress.create', health: 'GOOD' },
      { type: 'progress.create', health: 'EXCELLENT' },
    ] as ProposalOperation[])).toBeNull();
  });
  it('returns the overlap key for two clinical_record.create ops (neither carrying a date)', () => {
    expect(
      findOverlappingWriteSet([
        { type: 'clinical_record.create', body: 'a' },
        { type: 'clinical_record.create', body: 'b' },
      ]),
    ).toBe('clinical:record');
  });
  it('returns the overlap key for a clinical create + update in one proposal', () => {
    expect(
      findOverlappingWriteSet([
        { type: 'clinical_record.create', body: 'a' },
        { type: 'clinical_record.update', body: 'b' },
      ]),
    ).toBe('clinical:record');
  });
  it('does not collide a clinical op with an unrelated op', () => {
    expect(
      findOverlappingWriteSet([
        { type: 'clinical_record.create', body: 'a' },
        { type: 'frequency.set', task: 'WATER', intervalDays: 7 },
      ]),
    ).toBeNull();
  });
});

describe('findOverlappingWriteSet lifecycle', () => {
  it('flags memorialize + gift on the same plant as overlapping (same lifecycle key)', () => {
    const overlap = findOverlappingWriteSet([
      { type: 'plant.memorialize', plantId: 'P1' },
      { type: 'plant.gift', plantId: 'P1' },
    ] as ProposalOperation[]);
    expect(overlap).toBe('plant:P1:lifecycle');
  });
  it('does NOT flag lifecycle ops on different plants', () => {
    expect(findOverlappingWriteSet([
      { type: 'plant.memorialize', plantId: 'P1' },
      { type: 'plant.gift', plantId: 'P2' },
    ] as ProposalOperation[])).toBeNull();
  });
});

describe('serializedBytes', () => {
  it('counts UTF-8 bytes, not code units', () => {
    expect(serializedBytes('á')).toBe(Buffer.byteLength(JSON.stringify('á')));
  });
});

describe('createProposalSchema', () => {
  it('accepts a valid summary + one operation', () => {
    expect(createProposalSchema.safeParse({
      summary: 'Water the fern',
      operations: [{ type: 'care.done', task: 'WATER', occurredOn: '2026-07-16' }],
    }).success).toBe(true);
  });
  it('rejects an empty operations array', () => {
    expect(createProposalSchema.safeParse({ summary: 'Nothing to do', operations: [] }).success).toBe(false);
  });
  it(`rejects more than MAX_OPERATIONS (${MAX_OPERATIONS}) operations`, () => {
    const operations = Array.from({ length: MAX_OPERATIONS + 1 }, () => ({
      type: 'care.done' as const,
      task: 'WATER' as const,
      occurredOn: '2026-07-16',
    }));
    expect(createProposalSchema.safeParse({ summary: 'Too many', operations }).success).toBe(false);
  });
});

describe('PROPOSAL_OPERATION_TYPES', () => {
  it('lists every discriminant in the union, in declaration order', () => {
    // ⚠️ THIS LIST IS A TRIPWIRE, AND IT IS MEANT TO BE GROWN. Specs 2 and 4 each append their new
    // discriminants here, in declaration order. Whoever meets it red: ADD the member. Never relax it to
    // `toContain` — the exact-equality is what makes a forgotten consumer fail loudly instead of shipping.
    expect(PROPOSAL_OPERATION_TYPES).toEqual([
      'profile.update', 'plant.update', 'progress.create', 'progress.update',
      'progress.delete', 'frequency.set', 'frequency.clear', 'care.done', 'note.create',
      'clinical_record.create', 'clinical_record.update', 'place.create', 'place.update',
      'city.create', 'city.update', 'plant.create', 'plant.memorialize', 'plant.gift',
      'substrate.refresh',
    ]);
  });
});

describe('discriminatedUnionMembers', () => {
  it('throws a descriptive error when the schema is not a ZodEffects-wrapped discriminated union', () => {
    expect(() => discriminatedUnionMembers(z.string())).toThrow(/operationSchema.*internal shape changed/i);
  });
});

describe('single-operation serialization bound', () => {
  // Per operation type, the LARGEST instance the schema will accept. This is a SINGLE-operation
  // assertion on purpose: 10 x 20,000 characters is ~200 KB, about three times the 64 KiB envelope, so a
  // proposal carrying several full-length records is refused by the envelope check — which is the
  // intended behaviour, not a flaw. What must never happen is a VALID SINGLE operation being
  // unsubmittable, and that is what this pins.
  const maxInstances: Record<string, unknown> = {
    'profile.update': { type: 'profile.update', potType: 'terracotta' },
    'plant.update': { type: 'plant.update', nickname: 'n'.repeat(120), placeId: 'p'.repeat(64) },
    'progress.create': { type: 'progress.create', health: 'GOOD', occurredOn: '2026-07-20', observations: 'o'.repeat(2000), sizeCm: 1, tags: [] },
    'progress.update': { type: 'progress.update', entryId: 'e'.repeat(64), health: 'GOOD', occurredOn: '2026-07-20', observations: 'o'.repeat(2000), sizeCm: 1, tags: [] },
    'progress.delete': { type: 'progress.delete', entryId: 'e'.repeat(64) },
    'frequency.set': { type: 'frequency.set', task: 'WATER', intervalDays: 3650 },
    'frequency.clear': { type: 'frequency.clear', task: 'WATER' },
    'care.done': { type: 'care.done', task: 'WATER', occurredOn: '2026-07-20' },
    'note.create': { type: 'note.create', plantId: 'p'.repeat(64), body: 'b'.repeat(NOTE_MAX_LEN) },
    'clinical_record.create': { type: 'clinical_record.create', body: 'b'.repeat(MAX_CLINICAL_BODY_CHARS), recordedOn: '2026-07-20' },
    'clinical_record.update': { type: 'clinical_record.update', body: 'b'.repeat(MAX_CLINICAL_BODY_CHARS) },
    'place.create': {
      type: 'place.create', cityId: 'c'.repeat(64), name: 'n'.repeat(120), indoor: true,
      lightType: 'BRIGHT_INDIRECT', climateControlled: true, humidityCharacter: 'HUMID',
      indoorTempMinC: 18, indoorTempMaxC: 30, airflow: 'breezy',
    },
    'place.update': {
      type: 'place.update', placeId: 'p'.repeat(64), name: 'n'.repeat(120), climateControlled: true,
      lightType: 'BRIGHT_INDIRECT', humidityCharacter: 'HUMID', airflow: 'breezy',
      indoorTempMinC: 18, indoorTempMaxC: 30,
    },
    'city.create': {
      type: 'city.create', name: 'n'.repeat(120), latitude: 20.67, longitude: -103.35,
      timezone: 't'.repeat(64),
    },
    'city.update': {
      type: 'city.update', cityId: 'c'.repeat(64), name: 'n'.repeat(120), latitude: 20.67,
      longitude: -103.35, timezone: 't'.repeat(64),
    },
    'plant.create': {
      type: 'plant.create', speciesSlug: 'nephrolepis-biserrata', placeId: 'p'.repeat(64),
      nickname: 'n'.repeat(120), acquiredOn: '2026-07-20',
    },
    'plant.memorialize': { type: 'plant.memorialize', plantId: 'p'.repeat(64) },
    'plant.gift': { type: 'plant.gift', plantId: 'p'.repeat(64) },
    'substrate.refresh': { type: 'substrate.refresh', plantId: 'p'.repeat(64), refreshedOn: '2026-08-01', charged: true },
  };

  const unionTypes = operationSchema.innerType().options.map(
    (m) => (m.shape as { type: { _def: { value: string } } }).type._def.value,
  );

  it('covers every member of the union (a new operation must be added here)', () => {
    expect(unionTypes.sort()).toEqual(Object.keys(maxInstances).sort());
  });

  it.each(Object.entries(maxInstances))('a lone maximum-size %s fits inside MAX_SERIALIZED_BYTES', (type, op) => {
    expect(operationSchema.safeParse(op).success, `${type} max instance must be schema-valid`).toBe(true);
    expect(serializedBytes([op])).toBeLessThanOrEqual(MAX_SERIALIZED_BYTES);
  });
});

describe('clinical record operations', () => {
  it('accepts a create with just a body', () => {
    expect(operationSchema.safeParse({ type: 'clinical_record.create', body: '# Note' }).success).toBe(true);
  });
  it('accepts a create with an explicit calendar recordedOn', () => {
    expect(
      operationSchema.safeParse({ type: 'clinical_record.create', body: '# Note', recordedOn: '2026-07-20' }).success,
    ).toBe(true);
  });
  it('rejects an ISO instant for recordedOn', () => {
    expect(
      operationSchema.safeParse({ type: 'clinical_record.create', body: 'x', recordedOn: '2026-07-20T00:00:00Z' })
        .success,
    ).toBe(false);
  });
  it('rejects a body over MAX_CLINICAL_BODY_CHARS', () => {
    const body = 'x'.repeat(MAX_CLINICAL_BODY_CHARS + 1);
    expect(operationSchema.safeParse({ type: 'clinical_record.create', body }).success).toBe(false);
  });
  it('rejects an empty body', () => {
    expect(operationSchema.safeParse({ type: 'clinical_record.create', body: '' }).success).toBe(false);
  });
  it('accepts an update with a body and rejects one carrying a date', () => {
    expect(operationSchema.safeParse({ type: 'clinical_record.update', body: '# Revised' }).success).toBe(true);
    expect(
      operationSchema.safeParse({ type: 'clinical_record.update', body: '# Revised', recordedOn: '2026-07-20' })
        .success,
    ).toBe(false);
  });
});

describe('place.create', () => {
  const valid = {
    type: 'place.create', cityId: 'CITY_1', name: 'Study window', indoor: true,
    lightType: 'BRIGHT_INDIRECT', climateControlled: false, humidityCharacter: 'NORMAL',
    indoorTempMinC: 18, indoorTempMaxC: 24, airflow: 'some',
  };
  it('accepts the full payload', () => {
    expect(operationSchema.safeParse(valid).success).toBe(true);
  });
  it('requires cityId, name, indoor and lightType', () => {
    expect(operationSchema.safeParse({ type: 'place.create', name: 'x' }).success).toBe(false);
  });
  it('rejects an unknown light type', () => {
    expect(operationSchema.safeParse({ ...valid, lightType: 'BLINDING' }).success).toBe(false);
  });
});

describe('place.update', () => {
  it('accepts a single condition change', () => {
    expect(operationSchema.safeParse({ type: 'place.update', placeId: 'P1', airflow: 'breezy' }).success).toBe(true);
  });
  it('rejects an op carrying only its target', () => {
    expect(operationSchema.safeParse({ type: 'place.update', placeId: 'P1' }).success).toBe(false);
  });
  it('allows null to clear the nullable conditions', () => {
    expect(operationSchema.safeParse({ type: 'place.update', placeId: 'P1', humidityCharacter: null }).success).toBe(true);
  });
  it('does NOT accept indoor or cityId — the owner cannot change them either', () => {
    expect(operationSchema.safeParse({ type: 'place.update', placeId: 'P1', indoor: false }).success).toBe(false);
    expect(operationSchema.safeParse({ type: 'place.update', placeId: 'P1', cityId: 'C2' }).success).toBe(false);
  });
});

describe('city operations', () => {
  const city = { type: 'city.create', name: 'Guadalajara', latitude: 20.67, longitude: -103.35, timezone: 'America/Mexico_City' };
  it('accepts a full city.create', () => {
    expect(operationSchema.safeParse(city).success).toBe(true);
  });
  it('bounds the coordinates', () => {
    expect(operationSchema.safeParse({ ...city, latitude: 91 }).success).toBe(false);
    expect(operationSchema.safeParse({ ...city, longitude: -181 }).success).toBe(false);
  });
  it('has NO isPrimary — primary-city selection is the owner’s, never an agent operation', () => {
    expect(operationSchema.safeParse({ ...city, isPrimary: true }).success).toBe(false);
  });
  it('accepts a partial city.update and rejects a target-only one', () => {
    expect(operationSchema.safeParse({ type: 'city.update', cityId: 'C1', timezone: 'UTC' }).success).toBe(true);
    expect(operationSchema.safeParse({ type: 'city.update', cityId: 'C1' }).success).toBe(false);
  });
});

describe('plant.create', () => {
  const p = { type: 'plant.create', speciesSlug: 'nephrolepis-biserrata', placeId: 'P1', acquiredOn: '2026-07-20' };
  it('accepts the minimal payload', () => {
    expect(operationSchema.safeParse(p).success).toBe(true);
  });
  it('accepts an optional nickname', () => {
    expect(operationSchema.safeParse({ ...p, nickname: 'Randy' }).success).toBe(true);
  });
  it('rejects an ISO instant for acquiredOn', () => {
    expect(operationSchema.safeParse({ ...p, acquiredOn: '2026-07-20T00:00:00Z' }).success).toBe(false);
  });
  it('has NO lastDone seeding — that is an owner-form affordance, not an agent one', () => {
    expect(operationSchema.safeParse({ ...p, lastDone: [] }).success).toBe(false);
  });
});

describe('garden write-set overlap', () => {
  it('rejects two ops touching the same place field', () => {
    expect(findOverlappingWriteSet([
      { type: 'place.update', placeId: 'P1', airflow: 'still' },
      { type: 'place.update', placeId: 'P1', airflow: 'breezy' },
    ] as never)).toBe('place:P1:airflow');
  });
  it('allows two ops touching DIFFERENT places', () => {
    expect(findOverlappingWriteSet([
      { type: 'place.update', placeId: 'P1', airflow: 'still' },
      { type: 'place.update', placeId: 'P2', airflow: 'breezy' },
    ] as never)).toBeNull();
  });
  it('never collides two creates — a create has no pre-existing target', () => {
    expect(findOverlappingWriteSet([
      { type: 'city.create', name: 'A', latitude: 0, longitude: 0, timezone: 'UTC' },
      { type: 'city.create', name: 'B', latitude: 1, longitude: 1, timezone: 'UTC' },
    ] as never)).toBeNull();
  });
});

describe('note.create operation', () => {
  it('is a member of the union', () => {
    expect(PROPOSAL_OPERATION_TYPES).toContain('note.create');
  });
  it('accepts a body with an optional plantId', () => {
    const parsed = operationSchema.parse({ type: 'note.create', body: 'Hoy la saqué al sol', plantId: 'p1' });
    expect(parsed).toMatchObject({ type: 'note.create', body: 'Hoy la saqué al sol', plantId: 'p1' });
    expect(operationSchema.parse({ type: 'note.create', body: 'sin plantId' })).toMatchObject({ type: 'note.create' });
  });
  it('rejects an empty body and a body over NOTE_MAX_LEN', () => {
    expect(() => operationSchema.parse({ type: 'note.create', body: '' })).toThrow();
    expect(() => operationSchema.parse({ type: 'note.create', body: 'x'.repeat(NOTE_MAX_LEN + 1) })).toThrow();
  });
  it('never collides in a write-set (two note creates are two new rows)', () => {
    expect(
      findOverlappingWriteSet([
        { type: 'note.create', body: 'a', plantId: 'p1' },
        { type: 'note.create', body: 'b', plantId: 'p1' },
      ] as never),
    ).toBeNull();
  });
});

describe('substrate.refresh (Spec 1 §7)', () => {
  it('is a member of the operation union', () => {
    expect(PROPOSAL_OPERATION_TYPES).toContain('substrate.refresh');
  });

  it('accepts a gardener-shaped op (plantId supplied) and a doctor-shaped one (plantId omitted)', () => {
    expect(operationSchema.safeParse({
      type: 'substrate.refresh', plantId: 'p1', refreshedOn: '2026-08-01', charged: true,
    }).success).toBe(true);
    expect(operationSchema.safeParse({
      type: 'substrate.refresh', refreshedOn: '2026-08-01',
    }).success).toBe(true);
  });

  // `refreshedOn` is REQUIRED here, unlike the owner-facing flows: an agent proposing a refresh always
  // names the date it learned about. A proposal is not itself an event with its own date the way a
  // registration or a REPOT completion is, so there is no "anchor to today" fallback to fall back TO.
  it('requires refreshedOn, and requires it to be a calendar date', () => {
    expect(operationSchema.safeParse({ type: 'substrate.refresh', plantId: 'p1' }).success).toBe(false);
    expect(operationSchema.safeParse({
      type: 'substrate.refresh', plantId: 'p1', refreshedOn: '2026-08-01T00:00:00Z',
    }).success).toBe(false);
  });

  it('is strict — an unknown field is rejected', () => {
    expect(operationSchema.safeParse({
      type: 'substrate.refresh', plantId: 'p1', refreshedOn: '2026-08-01', soilMix: 'aroid',
    }).success).toBe(false);
  });

  // The write-set key MUST be target-qualified when plantId is supplied. A gardener may legitimately
  // refresh TWO different plants in one proposal; an id-free key would make those collide.
  it('collides on the SAME plant and does NOT collide on DIFFERENT plants', () => {
    const same = findOverlappingWriteSet([
      { type: 'substrate.refresh', plantId: 'p1', refreshedOn: '2026-08-01' },
      { type: 'substrate.refresh', plantId: 'p1', refreshedOn: '2026-07-01' },
    ] as never);
    expect(same).not.toBeNull();

    const different = findOverlappingWriteSet([
      { type: 'substrate.refresh', plantId: 'p1', refreshedOn: '2026-08-01' },
      { type: 'substrate.refresh', plantId: 'p2', refreshedOn: '2026-08-01' },
    ] as never);
    expect(different).toBeNull();
  });

  // The doctor's session is pinned to one plant, so for it the field name alone is unambiguous — which
  // is why the live pattern keys on the PRESENCE of plantId, not on the scope.
  it('collides for two id-free (doctor-shaped) refreshes', () => {
    const overlap = findOverlappingWriteSet([
      { type: 'substrate.refresh', refreshedOn: '2026-08-01' },
      { type: 'substrate.refresh', refreshedOn: '2026-07-01' },
    ] as never);
    expect(overlap).not.toBeNull();
  });
});

// TWO MECHANISMS OF UNEQUAL STRENGTH (Spec 4 §5.3). This asserts the STRONGER one: absence.
// `progress.delete` is withheld from the gardener by the capability map — a table entry, tested elsewhere.
// These three are withheld from EVERYONE because they do not exist to be granted.
describe('operations that exist for nobody', () => {
  for (const type of ['plant.delete', 'place.delete', 'city.delete']) {
    it(`has no ${type} member in the union`, () => {
      const r = operationSchema.safeParse({ type, id: 'X' });
      expect(r.success).toBe(false);
      // It fails at the DISCRIMINATOR, before any capability map is consulted.
      expect(JSON.stringify(r)).toContain('invalid_union_discriminator');
    });
  }
});

describe('measurement semantics on the proposal operations (Spec 3 §5, D44)', () => {
  const memberFor = (type: string) =>
    (discriminatedUnionMembers(operationSchema) as any[]).find(
      (m) => m.shape.type._def.value === type,
    );
  const descriptionOf = (schema: any): string => {
    let s = schema;
    while (s) {
      if (typeof s._def.description === 'string' && s._def.description) return s._def.description;
      s = s._def.innerType ?? s._def.schema;
    }
    return '';
  };

  it.each(['progress.create', 'progress.update'])(
    '%s.sizeCm names the field as the HEIGHT and names the CONSEQUENCE of not using it',
    (type) => {
      const d = descriptionOf(memberFor(type).shape.sizeCm);
      expect(d).toContain('HEIGHT');
      expect(d).toContain('ONLY height the care engine reads');
      // The load-bearing sentence: the gardener wrote a seedling's height into `observations`, which the
      // engine cannot read, so the plant produced no crowding signal at all. The tool worked; the manual
      // did not.
      expect(d).toContain('observations');
    },
  );

  it('both progress operations share ONE description string — never two copies that can drift', () => {
    expect(descriptionOf(memberFor('progress.create').shape.sizeCm)).toBe(
      descriptionOf(memberFor('progress.update').shape.sizeCm),
    );
  });

  it('frequency.set.intervalDays says it is a cadence in DAYS, not a date', () => {
    const d = descriptionOf(memberFor('frequency.set').shape.intervalDays);
    expect(d).toContain('DAYS');
  });
});
