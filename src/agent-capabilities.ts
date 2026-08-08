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
 *
 * `requireFields` is its exact mirror image, and it exists for the same reason `omitFields` does: the
 * operation union is SCOPE-AGNOSTIC, so a field that one scope must always supply cannot be marked
 * required in Zod without breaking the other scope. `plantId` is the whole of the case today — it is
 * `.optional()` on every plant-scoped operation precisely because the doctor must not carry it at all
 * (its token pins the plant; `omitFields` strips the field), while the gardener, owner-anchored, MUST name
 * the plant every plant-scoped operation targets or the operation cannot resolve a target at all.
 *
 * ⚠️ THIS FIELD IS DOCUMENTATION-AUTHORITATIVE, NOT AN ENFORCEMENT POINT — never read it as one. The API
 * refuses a gardener plant-scoped operation with no `plantId` twice already, in its own code (propose time
 * in `proposals.service.ts`, apply time in `proposal-applier.service.ts`), and NEITHER reads this table.
 * What `requireFields` fixes is a doc that said the opposite of what those two refusals do: the shared
 * tool-doc renderer computed its `Required` column from the Zod schema ALONE, blind to the scope it was
 * rendering for, so all eleven of the gardener's plant-scoped operations advertised `plantId` as
 * "optional" while the runtime returned a 400 for omitting it. An agent that believed the doc burned a
 * turn on a request that could never succeed. The API's own encoding of the same fact (its
 * `GARDEN_SCOPED_OPS` complement) is deliberately left in place and cross-checked by a test rather than
 * replaced, because the two are NOT equivalent: the API's check also catches a doctor proposal that
 * carries no pinned plant, which this scope×operation table cannot express.
 */
export type OperationCapability = {
  allowed: boolean;
  omitFields?: readonly string[];
  requireFields?: readonly string[];
};

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
    // The owner's Postpone button, agent-side. Both scopes hold it: the owner's ruling was simply "let the
    // gardener and the doctor mark an activity as postponed themselves." Like every plant-scoped op, the
    // doctor may not name its target plant.
    //
    // REPOT *is* in this operation's task vocabulary. The previous comment here claimed the opposite and
    // cited a `POSTPONABLE_TASKS` constant that does not exist anywhere in the workspace. What is actually
    // true: `care.postpone`'s `task` is `z.enum(FREQUENCY_BEARING_TASKS)` — all six tasks, REPOT included —
    // and REPOT is simply postponed by REASON rather than by DATE. The shared schema's own `.superRefine()`
    // enforces that in both directions: on REPOT `reason` is REQUIRED and `postponeToOn` is FORBIDDEN; on
    // every other task `postponeToOn` is REQUIRED and `reason` is FORBIDDEN. None of that is expressed by
    // this row -- see `carePostpone` in `proposal-operations.ts`.
    'care.postpone': { allowed: true, omitFields: ['plantId'] },
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
    // Both agents legitimately learn "you repotted this into fresh soil last month" from the owner in
    // conversation, and until now had no way to record it. It is a SUBSTRATE fact, not a relocation, so
    // it does not touch the doctor/gardener `placeId` asymmetry — the doctor may propose it. Like every
    // plant-scoped op, the doctor may not name its target plant.
    'substrate.refresh': { allowed: true, omitFields: ['plantId'] },
  },
  gardener: {
    // `plantId` is REQUIRED of the gardener on EVERY plant-scoped op it may propose — the exact mirror of
    // the doctor's `omitFields: ['plantId']` above. The gardener's token is anchored to the OWNER, not to a
    // plant, so there is no pin to inherit: an operation that names no plant cannot resolve a target and is
    // refused with a 400. Zod cannot carry this (the union serves both scopes, and requiring the field
    // would break the doctor, which must not send it at all), so the map carries it and the tool-doc
    // renderer reads it. The eleven rows below are exactly `gardener-permitted` MINUS the five operations
    // that target no existing plant (`place.*`, `city.*`, `plant.create`) — an equivalence the API's own
    // test pins against its `GARDEN_SCOPED_OPS` set, so the two encodings can never drift apart silently.
    'profile.update': { allowed: true, requireFields: ['plantId'] },
    'plant.update': { allowed: true, requireFields: ['plantId'] },
    'progress.create': { allowed: true, requireFields: ['plantId'] },
    'progress.update': { allowed: true, requireFields: ['plantId'] },
    'progress.delete': { allowed: false },
    'frequency.set': { allowed: true, requireFields: ['plantId'] },
    'frequency.clear': { allowed: true, requireFields: ['plantId'] },
    'care.done': { allowed: true, requireFields: ['plantId'] },
    // Same asymmetry as every other plant-scoped op: owner-anchored, so it MUST name the plant it targets.
    'care.postpone': { allowed: true, requireFields: ['plantId'] },
    // Same asymmetry as progress.create: the gardener supplies its own `plantId`, unfiltered — and, being
    // plant-scoped, MUST supply it. This is the operation the live gardener reported the contradiction on:
    // its guide called `plantId` obligatory while the generated tool doc called it optional.
    'note.create': { allowed: true, requireFields: ['plantId'] },
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
    // unfiltered — and, being plant-scoped, must supply it, exactly like every other such op.
    'plant.memorialize': { allowed: true, requireFields: ['plantId'] },
    'plant.gift': { allowed: true, requireFields: ['plantId'] },
    // Owner-anchored, so it supplies its own `plantId`, unfiltered — and must, exactly like every other
    // plant-scoped op it may propose.
    'substrate.refresh': { allowed: true, requireFields: ['plantId'] },
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

/**
 * The fields THIS scope must always supply on THIS operation, even where the shared Zod schema marks them
 * `.optional()` (it must, because the union serves every scope). Fails closed exactly like its sibling: an
 * unknown scope reports nothing required rather than indexing into `undefined`.
 *
 * Read by the tool-doc renderer so a generated `Required` column tells the agent the truth about ITS OWN
 * scope. It is NOT an enforcement point — see the `OperationCapability` doc comment for why the API keeps
 * its own refusal and why that is deliberate rather than a fork left standing.
 */
export function requiredFieldsFor(scope: AgentScope, type: ProposalOperationType): readonly string[] {
  return AGENT_CAPABILITIES[scope]?.[type]?.requireFields ?? [];
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

/**
 * `assertOmitFieldsAreRealFields`'s mirror, for the same reason and with one extra check the omit side does
 * not need.
 *
 * 1. **A typo omits nothing; a typo REQUIRES nothing.** `requireFields: ['plantID']` would silently promote
 *    no column at all, leaving the very field it meant to mark obligatory documented as "optional" — the
 *    exact doc↔API divergence this mechanism exists to close, arriving through a typo instead of a missing
 *    entry. Nothing else would ever notice: the renderer just wouldn't find a match.
 * 2. **A field may never be BOTH withheld and required of the same scope.** That combination is a genuine
 *    contradiction, not a corner case — the doc would have to tell the agent to always send a field it is
 *    forbidden to send — and it is one edit away at all times, because `plantId` really is withheld from
 *    one scope and required of the other. This is precisely the class of "table entry a future edit could
 *    get wrong" the project's own capability rules single out as the weaker kind of guarantee, so it gets
 *    a test rather than a comment.
 *
 * Called by this package's suite AND by each agent repo's tool-doc generator, exactly like its sibling —
 * so a bad entry fails both the shared build and the consuming repo's build, loudly, at generation time.
 */
export function assertRequireFieldsAreRealFields(): void {
  const shapeKeys = operationShapeKeys();
  const problems: string[] = [];
  for (const scope of AGENT_SCOPES) {
    for (const type of PROPOSAL_OPERATION_TYPES) {
      const keys = shapeKeys.get(type) ?? new Set<string>();
      const omitted = new Set(omittedFieldsFor(scope, type));
      for (const field of requiredFieldsFor(scope, type)) {
        if (!keys.has(field)) {
          problems.push(`${scope}.${type}.requireFields lists "${field}", which is not a field on ${type}`);
        }
        if (omitted.has(field)) {
          problems.push(
            `${scope}.${type} both REQUIRES and OMITS "${field}" — the doc would demand a field the API refuses`,
          );
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `agent-capabilities: AGENT_CAPABILITIES (in @retaxmaster/my-plants-species-schema/agent-capabilities) ` +
        `has requireFields that are unknown or contradictory — check the map:\n${problems.join('\n')}`,
    );
  }
}
