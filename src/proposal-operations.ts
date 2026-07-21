import { z } from 'zod';
import { plantProfileUpdateSchema } from './plant-profile.js';
import { PROGRESS_TAG_KEYS } from './progress-tag-constants.js';
import { FREQUENCY_BEARING_TASKS, PROGRESS_HEALTH_VALUES, MAX_SIZE_CM } from './care-operations-constants.js';

/** Calendar date, per the project's date rules. NEVER an ISO instant. */
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD calendar date');

const task = z.enum(FREQUENCY_BEARING_TASKS);
const health = z.enum(PROGRESS_HEALTH_VALUES);
const progressTag = z.enum(PROGRESS_TAG_KEYS);

const profileUpdate = plantProfileUpdateSchema.extend({ type: z.literal('profile.update') }).strict();
const plantUpdate = z.object({
  type: z.literal('plant.update'),
  nickname: z.string().max(120).nullable().optional(),
  placeId: z.string().min(1).optional(),
}).strict();
const progressCreate = z.object({
  type: z.literal('progress.create'),
  health,
  occurredOn: ymd.optional(),
  observations: z.string().max(2000).nullable().optional(),
  sizeCm: z.number().int().positive().max(MAX_SIZE_CM).nullable().optional(),
  tags: z.array(progressTag).max(PROGRESS_TAG_KEYS.length).optional(),
}).strict();
const progressUpdate = z.object({
  type: z.literal('progress.update'),
  entryId: z.string().min(1),
  health: health.optional(),
  occurredOn: ymd.optional(),
  observations: z.string().max(2000).nullable().optional(),
  sizeCm: z.number().int().positive().max(MAX_SIZE_CM).nullable().optional(),
  tags: z.array(progressTag).max(PROGRESS_TAG_KEYS.length).optional(),
}).strict();
const progressDelete = z.object({ type: z.literal('progress.delete'), entryId: z.string().min(1) }).strict();
const frequencySet = z.object({ type: z.literal('frequency.set'), task, intervalDays: z.number().int().min(1).max(3650) }).strict();
const frequencyClear = z.object({ type: z.literal('frequency.clear'), task }).strict();
const careDone = z.object({ type: z.literal('care.done'), task, occurredOn: ymd }).strict();

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
// "no field to change". Any type absent from this map falls to DEFAULT_IDENTITY_KEYS below. An entry is
// added here in the SAME change as its operation's z.object — never ahead of it — so the key is checked
// against the real ProposalOperationType union: a typo (or a member that hasn't landed yet) is a compile
// error, not a silently-ignored map miss.
const IDENTITY_KEYS_BY_TYPE: Partial<Record<ProposalOperationType, ReadonlySet<string>>> = {
  'progress.update': new Set(['type', 'entryId']),
};
const DEFAULT_IDENTITY_KEYS: ReadonlySet<string> = new Set(['type']);
const REQUIRES_A_FIELD: ReadonlySet<ProposalOperationType> = new Set(['profile.update', 'plant.update', 'progress.update']);

export const operationSchema = z
  .discriminatedUnion('type', [profileUpdate, plantUpdate, progressCreate, progressUpdate, progressDelete, frequencySet, frequencyClear, careDone, clinicalRecordCreate, clinicalRecordUpdate])
  .superRefine((op, ctx) => {
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
    case 'profile.update': return Object.keys(op).filter((k) => k !== 'type').map((k) => `profile:${k}`);
    case 'plant.update': return Object.keys(op).filter((k) => k !== 'type').map((k) => `plant:${k}`);
    case 'progress.create': return []; // a create has no pre-existing target, so two creates never collide
    case 'progress.update':
    case 'progress.delete': return [`entry:${op.entryId}`];
    case 'frequency.set':
    case 'frequency.clear': return [`frequency:${op.task}`];
    case 'care.done': return [`care:${op.task}:${op.occurredOn}`];
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
