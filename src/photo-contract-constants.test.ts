import { describe, expect, it } from 'vitest';
import {
  PHOTO_STATUSES,
  PHOTO_FAILURE_KINDS,
  PHOTO_FAILURE_CODES,
} from './photo-contract-constants.js';

describe('photo-contract value sets (spec §3.1 / §5.2)', () => {
  it('lists every photo status including RECOVERING', () => {
    // RECOVERING is an INTERNAL recovery state (spec §4.5); the web renders it identically to PROCESSING,
    // but it MUST be in the canonical set so neither side can forget it.
    expect([...PHOTO_STATUSES]).toEqual(['PENDING', 'PROCESSING', 'RECOVERING', 'READY', 'FAILED']);
  });

  it('lists both failure kinds', () => {
    expect([...PHOTO_FAILURE_KINDS]).toEqual(['transient', 'permanent']);
  });

  it('is the closed failureCode union from §5.2', () => {
    // The ImageErrorCode image faults + inbox_lost (missing/unreadable staged bytes) + upload_failed
    // (an exhausted TRANSIENT failure). NOT a free-text field.
    expect([...PHOTO_FAILURE_CODES]).toEqual([
      'image_decode_failed',
      'image_unsupported_format',
      'image_animated',
      'image_too_large',
      'inbox_lost',
      'upload_failed',
    ]);
  });
});
