import { describe, expect, it } from 'vitest';
import {
  operationSchema,
  createProposalSchema,
  findOverlappingWriteSet,
  serializedBytes,
  MAX_OPERATIONS,
  type ProposalOperation,
} from './proposal-operations.js';

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
  it('returns null for two progress.create ops — a create has no pre-existing target, so creates never collide', () => {
    expect(findOverlappingWriteSet([
      { type: 'progress.create', health: 'GOOD' },
      { type: 'progress.create', health: 'EXCELLENT' },
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
