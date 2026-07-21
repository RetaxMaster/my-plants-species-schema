import { PROPOSAL_OPERATION_TYPES, type ProposalOperationType } from './proposal-operations.js';

/** The agent roles that can hold a scoped token. Mirrors the JWT's `scope` claim. */
export const AGENT_SCOPES = ['doctor', 'gardener'] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

/**
 * One cell of the map. `omitFields` restricts a PERMITTED operation at FIELD level — the operation
 * schema is shared, so `plant.update` keeps `placeId` and the map is what withholds it (spec §4.4).
 */
export type OperationCapability = { allowed: boolean; omitFields?: readonly string[] };

/**
 * Agent scope → operation type → capability. A pure data table, deliberately exhaustive: the
 * Record<AgentScope, Record<ProposalOperationType, …>> type makes a missing row a COMPILE error, and
 * agent-capabilities.test.ts makes it a runtime failure too. Both, because a `Record` over a widened
 * union stops catching it the moment anyone reaches for an index signature.
 *
 * ⚠️ `progress.delete` is withheld from the gardener and that guarantee is WEAKER than it looks: it is
 * a table entry a future edit could get wrong, unlike "no plant.delete exists", which is enforced by
 * the operation's ABSENCE. Never describe the two as one invariant (ledger D4).
 */
export const AGENT_CAPABILITIES: Record<AgentScope, Record<ProposalOperationType, OperationCapability>> = {
  doctor: {
    'profile.update': { allowed: true },
    // Relocation is the gardener's exclusively (spec §4.4): the doctor diagnoses, the gardener places.
    'plant.update': { allowed: true, omitFields: ['placeId'] },
    'progress.create': { allowed: true },
    'progress.update': { allowed: true },
    'progress.delete': { allowed: true },
    'frequency.set': { allowed: true },
    'frequency.clear': { allowed: true },
    'care.done': { allowed: true },
  },
  gardener: {
    'profile.update': { allowed: true },
    'plant.update': { allowed: true },
    'progress.create': { allowed: true },
    'progress.update': { allowed: true },
    'progress.delete': { allowed: false },
    'frequency.set': { allowed: true },
    'frequency.clear': { allowed: true },
    'care.done': { allowed: true },
  },
};

export function mayPropose(scope: AgentScope, type: ProposalOperationType): boolean {
  return AGENT_CAPABILITIES[scope][type]?.allowed === true;
}

export function omittedFieldsFor(scope: AgentScope, type: ProposalOperationType): readonly string[] {
  return AGENT_CAPABILITIES[scope][type]?.omitFields ?? [];
}

/** The withheld field keys actually present on this operation object. Empty = nothing to refuse. */
export function forbiddenFieldsIn(scope: AgentScope, op: { type: ProposalOperationType }): string[] {
  return omittedFieldsFor(scope, op.type).filter((f) => f in op);
}

/** The operation types a scope may propose, in union order — the denominator for doc + i18n parity. */
export function permittedTypesFor(scope: AgentScope): ProposalOperationType[] {
  return PROPOSAL_OPERATION_TYPES.filter((t) => mayPropose(scope, t));
}
