import { describe, expect, it } from 'vitest';
import { PROPOSAL_OPERATION_TYPES } from './proposal-operations.js';
import { AGENT_SCOPES, AGENT_CAPABILITIES, mayPropose, omittedFieldsFor, forbiddenFieldsIn } from './agent-capabilities.js';

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

  it('withholds placeId from the doctor at FIELD level, keeping plant.update itself permitted', () => {
    expect(mayPropose('doctor', 'plant.update')).toBe(true);
    expect(omittedFieldsFor('doctor', 'plant.update')).toEqual(['placeId']);
    expect(omittedFieldsFor('gardener', 'plant.update')).toEqual([]);
  });

  it('reports only the withheld fields actually present on the operation', () => {
    expect(forbiddenFieldsIn('doctor', { type: 'plant.update', nickname: 'Randy' } as never)).toEqual([]);
    expect(forbiddenFieldsIn('doctor', { type: 'plant.update', placeId: 'p1' } as never)).toEqual(['placeId']);
    expect(forbiddenFieldsIn('gardener', { type: 'plant.update', placeId: 'p1' } as never)).toEqual([]);
  });
});
