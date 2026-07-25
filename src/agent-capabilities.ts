import {
  operationSchema,
  PROPOSAL_OPERATION_TYPES,
  discriminatedUnionMembers,
  type ProposalOperationType,
} from './proposal-operations.js';

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
    // `plantId` is withheld from the doctor on EVERY plant-scoped op: the doctor's token is pinned to ONE
    // plant, so the applier must resolve the target from `proposal.plantId` (the pin), never from an
    // agent-supplied `op.plantId`. Absent this field-level withholding a doctor proposal could name another
    // of the owner's plants and reach it — a genuine privilege escalation across the doctor's one-plant
    // boundary. The gardener, owner-anchored with no pin, is the scope that legitimately supplies `plantId`.
    'profile.update': { allowed: true, omitFields: ['plantId'] },
    // Relocation is the gardener's exclusively (spec §4.4): the doctor diagnoses, the gardener places. And
    // like every plant-scoped op, the doctor may not name its target plant.
    'plant.update': { allowed: true, omitFields: ['placeId', 'plantId'] },
    'progress.create': { allowed: true, omitFields: ['plantId'] },
    'progress.update': { allowed: true, omitFields: ['plantId'] },
    'progress.delete': { allowed: true },
    'frequency.set': { allowed: true, omitFields: ['plantId'] },
    'frequency.clear': { allowed: true, omitFields: ['plantId'] },
    'care.done': { allowed: true, omitFields: ['plantId'] },
    // A free-form journal note follows the same plant-scoped asymmetry as progress.create: both roles
    // may add one, and the doctor's `plantId` is withheld exactly like every other plant-scoped op.
    'note.create': { allowed: true, omitFields: ['plantId'] },
    // Clinical records are doctor-authored only (spec §4.4): the doctor diagnoses and files the case
    // note, the gardener never does.
    'clinical_record.create': { allowed: true },
    'clinical_record.update': { allowed: true },
    // The five garden operations are the gardener's exclusively (spec §5.2/§5.3): the doctor is scoped
    // to one plant and never touches places, cities, or the creation of a new plant.
    'place.create': { allowed: false },
    'place.update': { allowed: false },
    'city.create': { allowed: false },
    'city.update': { allowed: false },
    'plant.create': { allowed: false },
    // Lifecycle transitions (spec §5b): both agents may retire a plant to memorial or gift it away.
    // Like every plant-scoped op, the doctor may not name its target plant.
    'plant.memorialize': { allowed: true, omitFields: ['plantId'] },
    'plant.gift': { allowed: true, omitFields: ['plantId'] },
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
    // Same asymmetry as progress.create: the gardener supplies its own `plantId`, unfiltered.
    'note.create': { allowed: true },
    // Withheld, never absent (ledger D4): the gardener scope exists and is classified for both new
    // operations even though it may not exercise either of them.
    'clinical_record.create': { allowed: false },
    'clinical_record.update': { allowed: false },
    // The five garden operations, granted (spec §5.2/§5.3): the gardener manages places, cities, and
    // adds new plants to the garden.
    'place.create': { allowed: true },
    'place.update': { allowed: true },
    'city.create': { allowed: true },
    'city.update': { allowed: true },
    'plant.create': { allowed: true },
    // Lifecycle transitions (spec §5b): the gardener is owner-anchored, so it supplies its own `plantId`,
    // unfiltered, exactly like every other plant-scoped op it may propose.
    'plant.memorialize': { allowed: true },
    'plant.gift': { allowed: true },
  },
};

// `scope` is typed as `AgentScope`, but every caller here is one hop from a JWT claim or a request-time
// value — never assume the compile-time type is the runtime reality. A scope with no row in the map
// (a value outside AGENT_SCOPES, or a future scope the map has not been extended for yet) DENIES
// explicitly rather than indexing into `undefined` and throwing a raw TypeError. That distinction
// matters: a thrown TypeError bypasses classifyFailure's VALIDATION mapping and surfaces as a generic
// 500, and — the sharper point — a security property that only holds because SOME OTHER caller happens
// to reject the value first (as `ProposalsController.requireDoctorToken()` does for `'doctor'` today) is
// one refactor away from silently disappearing. Fail closed here, unconditionally.
export function mayPropose(scope: AgentScope, type: ProposalOperationType): boolean {
  return AGENT_CAPABILITIES[scope]?.[type]?.allowed === true;
}

export function omittedFieldsFor(scope: AgentScope, type: ProposalOperationType): readonly string[] {
  return AGENT_CAPABILITIES[scope]?.[type]?.omitFields ?? [];
}

/** The withheld field keys actually present on this operation object. Empty = nothing to refuse. */
export function forbiddenFieldsIn(scope: AgentScope, op: { type: ProposalOperationType }): string[] {
  return omittedFieldsFor(scope, op.type).filter((f) => f in op);
}

/** The operation types a scope may propose, in union order — the denominator for doc + i18n parity. */
export function permittedTypesFor(scope: AgentScope): ProposalOperationType[] {
  return PROPOSAL_OPERATION_TYPES.filter((t) => mayPropose(scope, t));
}

/**
 * Each operation's real field keys, via the SAME guarded accessor `discriminatedUnionMembers` uses
 * elsewhere (proposal-operations.ts) — never a second reflection walk of `operationSchema`'s internals.
 */
function operationShapeKeys(): ReadonlyMap<ProposalOperationType, ReadonlySet<string>> {
  const entries = discriminatedUnionMembers(operationSchema).map((m) => {
    const shape = (m as unknown as { shape: Record<string, { _def: { value: string } }> }).shape;
    const type = shape.type._def.value as ProposalOperationType;
    return [type, new Set(Object.keys(shape))] as const;
  });
  return new Map(entries);
}

/**
 * The invariant every tool-doc generator across the agent repos leans on: an `omitFields` entry in
 * `AGENT_CAPABILITIES` must actually name a field that exists on that operation's schema. A typo
 * (`placeID` for `placeId`) would otherwise omit NOTHING — the field it meant to withhold stays fully
 * documented, with no error anywhere, which is exactly the doc↔API divergence the capability map exists
 * to prevent, arriving through a typo instead of a missing filter.
 *
 * This lives here — beside `AGENT_CAPABILITIES` and `operationSchema`, which both live in this package —
 * rather than in each consumer, so the whole map is validated ONCE, in the repo that owns it, instead of
 * every agent repo re-deriving the same "walk the union, map type → field keys" reflection. Called by this
 * package's own test suite (so every `./scripts/test-all.sh` run validates the map) AND by each agent
 * repo's tool-doc generator at generation time (so a typo fails that repo's build loudly, not quietly).
 */
export function assertOmitFieldsAreRealFields(): void {
  const shapeKeys = operationShapeKeys();
  const problems: string[] = [];
  for (const scope of AGENT_SCOPES) {
    for (const type of PROPOSAL_OPERATION_TYPES) {
      const keys = shapeKeys.get(type) ?? new Set<string>();
      for (const field of omittedFieldsFor(scope, type)) {
        if (!keys.has(field)) {
          problems.push(`${scope}.${type}.omitFields lists "${field}", which is not a field on ${type}`);
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `agent-capabilities: AGENT_CAPABILITIES (in @retaxmaster/my-plants-species-schema/agent-capabilities) ` +
        `has omitFields referencing unknown field(s) — check the map for a typo:\n${problems.join('\n')}`,
    );
  }
}
