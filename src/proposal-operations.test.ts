import { describe, expect, it } from 'vitest';
import { operationSchema, createProposalSchema, findOverlappingWriteSet, serializedBytes, MAX_OPERATIONS } from './proposal-operations.js';

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
    ] as never)).toBe('frequency:WATER');
  });
  it('returns null when nothing overlaps', () => {
    expect(findOverlappingWriteSet([
      { type: 'frequency.set', task: 'WATER', intervalDays: 7 },
      { type: 'care.done', task: 'FERTILIZE', occurredOn: '2026-07-16' },
    ] as never)).toBeNull();
  });
});

describe('serializedBytes', () => {
  it('counts UTF-8 bytes, not code units', () => {
    expect(serializedBytes('á')).toBe(Buffer.byteLength(JSON.stringify('á')));
  });
});
