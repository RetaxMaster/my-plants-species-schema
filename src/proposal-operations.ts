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

const IDENTITY_KEYS = new Set(['type', 'entryId', 'task']);
const REQUIRES_A_FIELD = new Set(['profile.update', 'plant.update', 'progress.update']);

export const operationSchema = z
  .discriminatedUnion('type', [profileUpdate, plantUpdate, progressCreate, progressUpdate, progressDelete, frequencySet, frequencyClear, careDone])
  .superRefine((op, ctx) => {
    if (!REQUIRES_A_FIELD.has(op.type)) return;
    const writes = Object.keys(op).filter((k) => !IDENTITY_KEYS.has(k));
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
