import { z } from 'zod';
import { plantProfileUpdateSchema, soilMixEnum } from './plant-profile.js';
import { PROGRESS_TAG_KEYS } from './progress-tag-constants.js';
import { FREQUENCY_BEARING_TASKS, PROGRESS_HEALTH_VALUES, MAX_SIZE_CM, NOTE_MAX_LEN } from './care-operations-constants.js';
import { repotPostponeReasonEnum } from './feedback-reason.js';
import { POT_SIZE_CM_MAX } from './plant-profile-constants.js';
import { airflowEnum, humidityCharacterEnum, lightTypeEnum } from './place.js';
import { strictYmd } from './calendar-date.js';

/**
 * Calendar date, per the project's date rules. NEVER an ISO instant. This is the STRICT variant
 * (`./calendar-date.js`) — a shape-only regex would silently accept `2026-02-31` and hand a write core
 * `2026-03-03` (JS `Date` rolls an impossible day forward), so the owner's consent and the persisted write
 * would disagree. Aliased to the historical local name so every call site below is unchanged.
 */
const ymd = strictYmd;

const task = z.enum(FREQUENCY_BEARING_TASKS);
const health = z.enum(PROGRESS_HEALTH_VALUES);
const progressTag = z.enum(PROGRESS_TAG_KEYS);

// The plant a plant-scoped operation targets. It is OMITTED by the doctor — its token is already pinned to
// one plant, and the capability map withholds this field from the doctor (`omitFields`), so a doctor
// proposal can never name another plant — and SUPPLIED by the gardener, whose token is owner-anchored with
// no pinned plant, so each plant-scoped op must name its own target within the owner's garden. It is
// `.optional()` here because the operation schema is scope-agnostic; the applier resolves the effective
// target as `op.plantId ?? proposal.plantId`, and the capability map (not this schema) enforces WHO may send
// it. `plantId` is always IDENTITY, never a write field — see IDENTITY_KEYS_BY_TYPE and writeSet below.
const plantTarget = z.string().min(1).optional();

/**
 * ONE description, used by BOTH progress operations (D44). Two copies of this sentence is the fork rule's
 * textbook case: the incident this text exists to prevent — the whole-garden agent recording a seedling's
 * height in free-text `observations`, where the engine cannot read it, so the plant produced no crowding
 * signal and was scheduled to repot in 538 days — was a DOCUMENTATION defect, not a capability one. The
 * second sentence is the load-bearing one: it names the consequence, not just the meaning.
 */
const SIZE_CM_DESCRIPTION =
  'The plant’s HEIGHT in centimetres at the time of this entry. This is the ONLY height the care engine ' +
  'reads — a height written into `observations` is invisible to it and will not affect any schedule. ' +
  'Record it here whenever you know it.';

const sizeCm = z
  .number()
  .int()
  .positive()
  .max(MAX_SIZE_CM)
  .describe(SIZE_CM_DESCRIPTION)
  .nullable()
  .optional();

const profileUpdate = plantProfileUpdateSchema.extend({ type: z.literal('profile.update'), plantId: plantTarget }).strict();
const plantUpdate = z.object({
  type: z.literal('plant.update'),
  plantId: plantTarget,
  nickname: z.string().max(120).nullable().optional(),
  placeId: z.string().min(1).optional(),
}).strict();
const progressCreate = z.object({
  type: z.literal('progress.create'),
  plantId: plantTarget,
  health,
  occurredOn: ymd.optional(),
  observations: z.string().max(2000).nullable().optional(),
  sizeCm,
  tags: z.array(progressTag).max(PROGRESS_TAG_KEYS.length).optional(),
}).strict();
const progressUpdate = z.object({
  type: z.literal('progress.update'),
  plantId: plantTarget,
  entryId: z.string().min(1),
  health: health.optional(),
  occurredOn: ymd.optional(),
  observations: z.string().max(2000).nullable().optional(),
  sizeCm,
  tags: z.array(progressTag).max(PROGRESS_TAG_KEYS.length).optional(),
}).strict();
const progressDelete = z.object({ type: z.literal('progress.delete'), entryId: z.string().min(1) }).strict();
const frequencySet = z.object({
  type: z.literal('frequency.set'),
  plantId: plantTarget,
  task,
  intervalDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .describe(
      'The number of DAYS between consecutive occurrences of this task — a cadence, never a date. ' +
        'Setting it overrides the engine’s computed interval for this plant until `frequency.clear`.',
    ),
}).strict();
const frequencyClear = z.object({ type: z.literal('frequency.clear'), plantId: plantTarget, task }).strict();
/**
 * `care.done`, with a CONDITIONALLY-required REPOT variant.
 *
 * A REPOT completion that does not say what the repot physically changed leaves the engine computing the
 * crowding ratio against a pot that no longer exists — silently, with a plausible-looking number, for the
 * rest of the plant's life. The owner's own Done form can no longer reach that state, so neither may an
 * agent. This grants NO new capability: the capability-map rows for `care.done` are untouched; the
 * operation's own schema simply requires more when `task === 'REPOT'`, and every scope that already holds
 * `care.done` inherits the requirement identically.
 *
 * The plan for this task modelled the requirement as a discriminated pair (two `z.object` variants unioned
 * on `task`, nested inside the outer `type`-discriminated union) so TypeScript would see the three fields
 * as non-optional on the REPOT branch. That shape does not build: zod's `discriminatedUnion` requires
 * every option to be a plain `ZodObject` exposing the discriminant as a `ZodLiteral` on `.shape` — a
 * nested `z.union(...)` has no `.shape` at all (throws at construction), and giving both variants the same
 * `type: z.literal('care.done')` and listing them as two separate top-level options throws too
 * ("Discriminator property type has duplicate value care.done"). Both were verified against the installed
 * zod (`^3.23.8`, resolved `3.25.76`) before writing this comment. So `care.done` stays the single flat
 * `ZodObject` the outer `discriminatedUnion` needs — the three REPOT fields are declared `.optional()` in
 * the shape, and the outer `.superRefine()` below enforces "required when `task === 'REPOT'`, forbidden
 * otherwise" at runtime. This is a strictly weaker TYPE than the plan envisioned (the fields stay optional
 * in `ProposalOperation`), but the RUNTIME contract — every test in this file's REPOT `describe` block — is
 * identical either way.
 */
const careDone = z
  .object({
    type: z.literal('care.done'),
    plantId: plantTarget,
    task,
    occurredOn: ymd,
    /** The NEW pot's rim DIAMETER in cm — not the radius, not the height. Required when `task === 'REPOT'`. */
    potSizeCm: z.number().int().positive().max(POT_SIZE_CM_MAX).optional(),
    /** The NEW medium. Spec 1's charge and structural-life clocks key on it. Required when `task === 'REPOT'`. */
    soilMix: soilMixEnum.optional(),
    /** Fresh, charged medium? `false` = reused / inert. Required when `task === 'REPOT'`. */
    charged: z.boolean().optional(),
    /**
     * Optional even on REPOT; when omitted with `charged: true`, the write core anchors it to
     * `occurredOn`. Only meaningful (and only accepted) alongside a REPOT completion.
     */
    refreshedOn: ymd.optional(),
  })
  .strict();

/** The three fields a REPOT `care.done` requires, and the only ones any OTHER `care.done` may not carry. */
const CARE_DONE_REPOT_ONLY_FIELDS = ['potSizeCm', 'soilMix', 'charged'] as const;

/**
 * The agent-facing half of the owner's own Postpone button, landing in the SAME write core the owner's
 * form does (`recordFeedbackCore`, `type: 'POSTPONED'`) — never a second implementation. A postponement
 * is not merely administrative: the engine LEARNS from it (repeated postponements lengthen the task's
 * interval, and a REPOT postpone can feed the repot calibration channel), which is precisely why it goes
 * through the owner's path rather than writing a `TaskOverride` directly.
 *
 * ⚠️ **REPOT is postponed by REASON, every other task by DATE — and the two vocabularies are mutually
 * exclusive.** This is not a stylistic split; it is what the write core actually does. For every task
 * except REPOT it reads `postponeToOn` and writes a `TaskOverride` at that day. REPOT returns EARLY into
 * `recordRepotFeedback`, which treats the postponement as an INSPECTION result: it takes one of the three
 * `REPOT_POSTPONE_REASONS`, derives its own administrative floor from `REPOT_FLOOR_DAYS[reason]`, and
 * **never reads `postponeToOn` at all**. So `postponeToOn` on a REPOT would be a field the write path
 * silently discards — the agent would believe it postponed to a date, the owner would see a different
 * date, and nothing anywhere would error. Forbidding it is what makes that impossible; the refinement
 * below enforces required-and-forbidden in both directions.
 *
 * The one thing an agent CANNOT do is resolve an open repot verdict: when the plant has an unresolved
 * REPOT evaluation the write core demands the `evaluationId` of the questionnaire row being answered, and
 * no agent can obtain one — it never runs the owner's questionnaire. That refusal STANDS unsoftened,
 * deliberately: "the same conditions the owner has" includes the conditions that stop it. Its WORDING,
 * however, does not reach the agent verbatim — an earlier version of this line claimed the 400 arrives
 * "UNMODIFIED" and that was wrong. The API's `classifyFailure` normalises every 400 into one of five
 * author-written sentences so no internal detail can escape to an agent, which is why both agent guides
 * pre-warn about this case in PROSE instead of relying on the error text.
 *
 * `postponeToOn` is REQUIRED on the date branch even though the owner's core treats it as optional. The
 * owner's UI always supplies it; an operation that omitted it would record a care event and move nothing.
 * It must also be strictly AFTER `occurredOn` — a "postpone" into the past makes the task MORE overdue,
 * the opposite of what the owner approving the card reads.
 *
 * SHAPE NOTE: a flat `ZodObject` with both fields `.optional()` and the require/forbid rule in the outer
 * `.superRefine()` — the SAME shape `care.done`'s REPOT variant already uses, for the same zod reason
 * (see `careDone`'s long comment). A second, differently-shaped way of saying "this task variant needs
 * different fields" would be the fork this project forbids.
 */
const carePostpone = z
  .object({
    type: z.literal('care.postpone'),
    plantId: plantTarget,
    task,
    /** The day the postponement is being recorded. */
    occurredOn: ymd,
    /** The day the task moves to. REQUIRED on every task except REPOT; FORBIDDEN on REPOT. */
    postponeToOn: ymd.optional(),
    /** Why the repot is being put off. REQUIRED when `task === 'REPOT'`; FORBIDDEN on every other task. */
    reason: repotPostponeReasonEnum.optional(),
  })
  .strict();

// A free-form owner/agent journal note. plantId follows the standard plant-scoped asymmetry
// (doctor omits — capability map withholds it; gardener supplies). body is the note text, bounded by
// the ONE shared NOTE_MAX_LEN. A CREATE: it appends a new PlantTimelineEvent row every time.
const noteCreate = z.object({
  type: z.literal('note.create'),
  plantId: plantTarget,
  body: z.string().min(1).max(NOTE_MAX_LEN),
}).strict();

// Mirrors the owner's own CreatePlaceDto (api src/places/create-place.dto.ts) field for field — the agent
// must never be able to create a shape the owner's own form cannot. One narrowing, deliberately kept
// narrower than the DTO rather than matched to it: the DTO's optional condition fields also accept an
// explicit `null` (class-validator's @IsOptional() skips validation on null too), but here they are plain
// `.optional()`, never `.nullable()`. On a CREATE there is no existing value to clear, so an agent expresses
// "unset" by omitting the field; `null` only becomes meaningful on `place.update`, where it clears a value
// that already exists.
const placeCreate = z.object({
  type: z.literal('place.create'),
  cityId: z.string().min(1),
  name: z.string().min(1).max(120),
  indoor: z.boolean(),
  lightType: lightTypeEnum,
  climateControlled: z.boolean().optional(),
  humidityCharacter: humidityCharacterEnum.optional(),
  indoorTempMinC: z.number().optional(),
  indoorTempMaxC: z.number().optional(),
  airflow: airflowEnum.optional(),
}).strict();

// Mirrors UpdatePlaceDto (api src/places/update-place.dto.ts:9-17) EXACTLY: name/climateControlled/lightType
// are optional-not-nullable; humidityCharacter/airflow/indoorTemp* are nullable (null clears). `indoor` and
// `cityId` are deliberately ABSENT — they are create-only for the owner too (create-place.dto.ts), and the
// agent must never exceed the owner's own reach.
const placeUpdate = z.object({
  type: z.literal('place.update'),
  placeId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  climateControlled: z.boolean().optional(),
  lightType: lightTypeEnum.optional(),
  humidityCharacter: humidityCharacterEnum.nullable().optional(),
  airflow: airflowEnum.nullable().optional(),
  indoorTempMinC: z.number().nullable().optional(),
  indoorTempMaxC: z.number().nullable().optional(),
}).strict();

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

// Mirrors CreateCityDto minus `isPrimary`: primary-city selection stays the owner's (Spec 4 §5.2).
const cityCreate = z.object({
  type: z.literal('city.create'),
  name: z.string().min(1).max(120),
  latitude, longitude,
  timezone: z.string().min(1).max(64),
}).strict();

// Unlike every other operation in this union, this is NOT a mirror of an owner-facing DTO — there is no
// `UpdateCityDto` and no update route: `api src/cities/cities.controller.ts` exposes only
// list/search/create/get/make-primary. The grant is deliberate, not an oversight (Spec 4 §5.2): the write
// core `updateCityCore` was extracted specifically so the gardener's proposal applier could be its only
// caller, giving the agent a capability the owner's own app has no path to today.
const cityUpdate = z.object({
  type: z.literal('city.update'),
  cityId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  timezone: z.string().min(1).max(64).optional(),
}).strict();

// Mirrors CreatePlantDto (api src/plants/create-plant.dto.ts) minus `lastDone`: seeding historical DONE
// events is an owner-form affordance for a plant they already owned, not something an agent should author.
const plantCreate = z.object({
  type: z.literal('plant.create'),
  speciesSlug: z.string().min(1),
  placeId: z.string().min(1),
  nickname: z.string().max(120).nullable().optional(),
  acquiredOn: ymd,
}).strict();

// Lifecycle transitions. Both carry ONLY the optional target plant — no writable fields — so they are
// NOT in REQUIRES_A_FIELD (a transition legitimately changes state without a field patch). Doctor omits
// plantId (pinned); gardener supplies it (owner-anchored). See spec §5b.
const plantMemorialize = z.object({ type: z.literal('plant.memorialize'), plantId: plantTarget }).strict();
const plantGift = z.object({ type: z.literal('plant.gift'), plantId: plantTarget }).strict();

// Records that the plant's medium was renewed on a given day. plantId follows the standard plant-scoped
// asymmetry (doctor omits — the capability map withholds it; gardener supplies it).
//
// `refreshedOn` is REQUIRED, unlike the owner-facing registration and REPOT-DONE flows, which may anchor
// to the event's own date. An agent proposing a refresh always names the date it learned about, and a
// proposal is not itself an event with a date of its own.
//
// `charged` OMITTED means "derive from the mix" (a null override), NOT "preserve whatever was stored".
// See refreshSubstrateCore's contract: a caller that says nothing about charge is not claiming anything
// about it, and preserving a prior value would let a partial proposal keep a stale override from an
// earlier, unrelated refresh.
const substrateRefresh = z.object({
  type: z.literal('substrate.refresh'),
  plantId: plantTarget,
  refreshedOn: ymd,
  charged: z.boolean().optional(),
}).strict();

/**
 * A clinical record body is Markdown and is by far the largest single operation this union carries.
 * The cap is per-field and deliberately smaller than the envelope: ONE max-size record serializes to
 * roughly 20 KB, comfortably inside MAX_SERIALIZED_BYTES. Several of them do NOT fit, and that is the
 * intended behaviour — the envelope is what bounds a MULTI-operation proposal.
 */
export const MAX_CLINICAL_BODY_CHARS = 20_000;

const clinicalBody = z.string().min(1).max(MAX_CLINICAL_BODY_CHARS);

/**
 * `recordedOn` is an explicit-intent ECHO, not a free choice: the server validates at APPLY time that it
 * equals the plant's own current calendar day, and refuses anything else. An unbounded value would let a
 * sealed past day be populated (the same power the same-day edit rule denies, through another door), and a
 * future-dated record would be unreachable by `clinical_record.update` until that day arrived, at which
 * point it would silently become editable.
 */
const clinicalRecordCreate = z.object({
  type: z.literal('clinical_record.create'),
  body: clinicalBody,
  recordedOn: ymd.optional(),
}).strict();

/**
 * Targets the record of the plant's CURRENT day, addressed by day rather than by id — there is at most one
 * such record by construction (the @@unique([plantId, recordedOn]) constraint), and addressing it by day is
 * what makes the same-day rule expressible at all. It therefore carries no date.
 */
const clinicalRecordUpdate = z.object({
  type: z.literal('clinical_record.update'),
  body: clinicalBody,
}).strict();

// Identity keys are PER TYPE, not global. `placeId` identifies the target of `place.update` but is a WRITE
// field on `plant.update` (relocation) — a single global set would reject a relocation-only plant.update as
// "no field to change". `plantId` is identity on EVERY plant-scoped op that carries it (it names the target
// plant, never a change), so a gardener op supplying only `plantId` and no real field is correctly rejected
// as "requires at least one field to change". Any type absent from this map falls to DEFAULT_IDENTITY_KEYS
// below. An entry is added here in the SAME change as its operation's z.object — never ahead of it — so the
// key is checked against the real ProposalOperationType union: a typo (or a member that hasn't landed yet)
// is a compile error, not a silently-ignored map miss.
const IDENTITY_KEYS_BY_TYPE: Partial<Record<ProposalOperationType, ReadonlySet<string>>> = {
  'profile.update': new Set(['type', 'plantId']),
  'plant.update': new Set(['type', 'plantId']),
  'progress.update': new Set(['type', 'plantId', 'entryId']),
  'place.update': new Set(['type', 'placeId']),
  'city.update': new Set(['type', 'cityId']),
};
// `substrate.refresh` is deliberately ABSENT from both this map and REQUIRES_A_FIELD: `refreshedOn` is
// required by its schema, so it can never arrive with nothing to change, and its only identity key is
// the default `type` (+ the globally-identity `plantId`, handled in writeSet below).
const DEFAULT_IDENTITY_KEYS: ReadonlySet<string> = new Set(['type']);
const REQUIRES_A_FIELD: ReadonlySet<ProposalOperationType> = new Set(['profile.update', 'plant.update', 'progress.update', 'place.update', 'city.update']);

export const operationSchema = z
  .discriminatedUnion('type', [profileUpdate, plantUpdate, progressCreate, progressUpdate, progressDelete, frequencySet, frequencyClear, careDone, carePostpone, noteCreate, clinicalRecordCreate, clinicalRecordUpdate, placeCreate, placeUpdate, cityCreate, cityUpdate, plantCreate, plantMemorialize, plantGift, substrateRefresh])
  .superRefine((op, ctx) => {
    // `care.done`'s REPOT variant: the three completion fields are REQUIRED when `task === 'REPOT'` and
    // FORBIDDEN on every other task — see the long comment on `careDone` above for why this lives here
    // (a runtime refine) rather than as a nested discriminated-union member.
    if (op.type === 'care.done') {
      if (op.task === 'REPOT') {
        for (const key of CARE_DONE_REPOT_ONLY_FIELDS) {
          if (op[key] === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `care.done requires ${key} when task is REPOT` });
          }
        }
      } else {
        for (const key of [...CARE_DONE_REPOT_ONLY_FIELDS, 'refreshedOn'] as const) {
          if (op[key] !== undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is only valid on a REPOT care.done` });
          }
        }
      }
    }
    // `care.postpone`: REPOT is postponed by REASON, every other task by DATE, and each branch FORBIDS the
    // other's field -- see `carePostpone`'s own comment for why a `postponeToOn` on a REPOT would be a
    // silently-discarded field rather than a harmless extra.
    if (op.type === 'care.postpone') {
      if (op.task === 'REPOT') {
        if (op.reason === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'care.postpone requires reason when task is REPOT' });
        }
        if (op.postponeToOn !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['postponeToOn'],
            message: 'postponeToOn is not valid on a REPOT care.postpone — a repot is postponed by reason, never by date',
          });
        }
      } else {
        if (op.reason !== undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'reason is only valid on a REPOT care.postpone' });
        }
        if (op.postponeToOn === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['postponeToOn'], message: 'care.postpone requires postponeToOn' });
        } else if (op.postponeToOn <= op.occurredOn) {
          // The owner's core happily writes a TaskOverride at any date, so a past `postponeToOn` would
          // persist and make the task MORE overdue. String comparison is exact for `YYYY-MM-DD` (both are
          // strict calendar dates, so fixed-width and zero-padded) and needs no Date parsing, which would
          // drag a timezone into a pure schema.
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['postponeToOn'],
            message: 'care.postpone requires postponeToOn to be after occurredOn',
          });
        }
      }
    }
    if (!REQUIRES_A_FIELD.has(op.type)) return;
    const identity = IDENTITY_KEYS_BY_TYPE[op.type] ?? DEFAULT_IDENTITY_KEYS;
    const writes = Object.keys(op).filter((k) => !identity.has(k));
    if (writes.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${op.type} requires at least one field to change` });
    }
  });
export type ProposalOperation = z.infer<typeof operationSchema>;

export type ProposalOperationType = ProposalOperation['type'];

type DiscriminantMember = { shape: { type: { _def: { value: string } } } };

/**
 * Reads the discriminated union's members out of `operationSchema`'s zod internals, validating the
 * shape before dereferencing it — a zod patch inside the existing `^3.23.8` range, or a future
 * `.transform()` wrapping the union, would otherwise throw a bare "Cannot read properties of undefined"
 * at MODULE LOAD, taking down the whole package import (this module is re-exported from `./index.js`)
 * for every consumer, not just this export. Mirrors `tool-doc.ts`'s `objectShape` convention: check the
 * shape explicitly, throw a named, descriptive error before going further. Exported so the guard itself
 * can be exercised with a malformed schema.
 */
export function discriminatedUnionMembers(schema: z.ZodTypeAny): DiscriminantMember[] {
  const options = (schema as unknown as { _def?: { schema?: { options?: unknown } } })._def?.schema?.options;
  const valid = Array.isArray(options) && options.length > 0 && options.every(
    (m) => typeof (m as { shape?: { type?: { _def?: { value?: unknown } } } })?.shape?.type?._def?.value === 'string',
  );
  if (!valid) {
    throw new Error(
      'proposal-operations: operationSchema\'s internal shape changed — expected a ZodEffects wrapping a ' +
        'ZodDiscriminatedUnion with literal `type` members at _def.schema.options',
    );
  }
  return options as DiscriminantMember[];
}

/**
 * The union's discriminants, at RUNTIME. `operationSchema` is a ZodEffects wrapping the
 * discriminatedUnion (the superRefine above), so the members live at `_def.schema.options`.
 * Derived — never hand-listed — so a new member cannot be forgotten by a consumer that indexes by type.
 */
export const PROPOSAL_OPERATION_TYPES: readonly ProposalOperationType[] = discriminatedUnionMembers(operationSchema)
  .map((m) => m.shape.type._def.value) as ProposalOperationType[];

export const MAX_OPERATIONS = 10;
export const MAX_SUMMARY_CHARS = 500;
export const MAX_SERIALIZED_BYTES = 64 * 1024;

export const createProposalSchema = z.object({
  summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
  operations: z.array(operationSchema).min(1).max(MAX_OPERATIONS),
}).strict();
export type CreateProposalBody = z.infer<typeof createProposalSchema>;

function writeSet(op: ProposalOperation): string[] {
  switch (op.type) {
    // The key embeds `plantId` when the gardener supplied it, exactly as place.update/city.update embed
    // their id below: the doctor's ops run inside a session pinned to ONE plant, so the field name alone is
    // unambiguous, but a garden-wide gardener proposal can legitimately touch the SAME field on two DIFFERENT
    // plants in one batch — dropping the id would make those collide. `plantId` itself is identity, never a
    // written field, so it is filtered out of the field list.
    case 'profile.update': {
      const prefix = op.plantId ? `profile:${op.plantId}` : 'profile';
      return Object.keys(op).filter((k) => k !== 'type' && k !== 'plantId').map((k) => `${prefix}:${k}`);
    }
    case 'plant.update': {
      const prefix = op.plantId ? `plant:${op.plantId}` : 'plant';
      return Object.keys(op).filter((k) => k !== 'type' && k !== 'plantId').map((k) => `${prefix}:${k}`);
    }
    case 'progress.create': return []; // a create has no pre-existing target, so two creates never collide
    case 'note.create': return []; // same reasoning: a new PlantTimelineEvent row every time, never a collision
    case 'progress.update':
    case 'progress.delete': return [`entry:${op.entryId}`]; // entryId is globally unique, so it already distinguishes plants
    case 'frequency.set':
    case 'frequency.clear': return [op.plantId ? `frequency:${op.plantId}:${op.task}` : `frequency:${op.task}`];
    // ONE shared `care:` namespace for BOTH care operations, deliberately -- the key carries no `type`
    // component, so a `care.done` and a `care.postpone` naming the same plant, task and day COLLIDE and the
    // proposal is refused. That is the correct answer, not an accident of reuse: marking a task done and
    // postponing it on the same day are contradictory instructions, and two postponements of the same task
    // on the same day would have the second silently overwrite the first's TaskOverride. Refusing the pair
    // makes the agent state which one it means.
    case 'care.done':
    case 'care.postpone': return [op.plantId ? `care:${op.plantId}:${op.task}:${op.occurredOn}` : `care:${op.task}:${op.occurredOn}`];
    // A CONSTANT key, deliberately date-free, for BOTH operations.
    //
    // `clinical:<recordedOn>` is not computable here: this function is PURE — no database, no owner, no
    // timezone — `clinical_record.update` carries no date at all, and `recordedOn` on a create is optional,
    // so the keyed form would degrade to `clinical:undefined` in exactly the common case the rule must
    // catch. A constant key refuses ANY two clinical operations in one proposal, which is correct anyway:
    // the @@unique([plantId, recordedOn]) constraint means there is at most one record per plant per day,
    // so two clinical operations in one proposal are always either redundant or contradictory.
    //
    // ⚠️ DELIBERATE DEVIATION from `progress.create` above, which returns [] because "a create has no
    // pre-existing target, so two creates never collide". That reasoning does NOT transfer: two clinical
    // creates DO collide, on the unique constraint, because the target is the DAY rather than a new row.
    // Do not "fix" this back to [].
    case 'clinical_record.create':
    case 'clinical_record.update': return ['clinical:record'];
    // Unlike `plant.update`/`profile.update` above, the key embeds the target id (`place:<id>:<field>`,
    // not `place:<field>`): those two run inside a session already scoped to ONE plant, so the field name
    // alone is unambiguous, but a garden-wide gardener proposal can legitimately touch several DIFFERENT
    // places or cities in one batch — dropping the id would make edits to two unrelated places collide.
    case 'place.update': return Object.keys(op).filter((k) => k !== 'type' && k !== 'placeId').map((k) => `place:${op.placeId}:${k}`);
    case 'city.update': return Object.keys(op).filter((k) => k !== 'type' && k !== 'cityId').map((k) => `city:${op.cityId}:${k}`);
    // Creates have no pre-existing target, so two creates never collide (same rule as progress.create).
    case 'place.create':
    case 'city.create':
    case 'plant.create': return [];
    case 'plant.memorialize':
    case 'plant.gift':
      // ONE shared key per plant: catches memorialize+gift-in-one-proposal. A lifecycle op batched with an
      // UNRELATED op on the same plant is NOT caught here — the mediator's target-aware pre-check owns that
      // (API task T21). Mirrors how plant.update keys `plant:<plantId>:<field>`.
      return [op.plantId ? `plant:${op.plantId}:lifecycle` : `plant:lifecycle`];
    case 'substrate.refresh': {
      // Target-qualified when the gardener supplied a plantId, exactly like profile.update/plant.update
      // above: an owner-anchored gardener may legitimately refresh the substrate of TWO DIFFERENT plants
      // in one proposal, and a key naming only the columns would make those collide with each other. The
      // doctor's session is pinned to one plant, so the bare field name is already unambiguous — which is
      // why this keys on the PRESENCE of plantId, never on the scope.
      const prefix = op.plantId ? `substrate:${op.plantId}` : 'substrate';
      return [`${prefix}:refreshedOn`, `${prefix}:charged`];
    }
  }
}

/** Pure. Returns the first overlapping write-set key, or null. The API wraps this in a BadRequestException. */
export function findOverlappingWriteSet(operations: ProposalOperation[]): string | null {
  const seen = new Set<string>();
  for (const op of operations) {
    for (const key of writeSet(op)) {
      if (seen.has(key)) return key;
      seen.add(key);
    }
  }
  return null;
}

/** Pure. Serialized UTF-8 byte length — control chars cost six, accents more than one. */
export function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null));
}
