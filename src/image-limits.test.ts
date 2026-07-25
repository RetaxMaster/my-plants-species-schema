import { describe, expect, it } from 'vitest';
import { IMAGE_MAX_EDGE, MAX_IMAGE_PIXELS } from './image-limits.js';

describe('MAX_IMAGE_PIXELS', () => {
  it('is the deliberately-chosen 64 MP ceiling (spec §2)', () => {
    // 64 MP clears the iPhone 16 Pro Max 48 MP mode (48.8 MP) with ~31% headroom. Do NOT round this
    // to 64 * 1024 * 1024 — the spec's ledger value is decimal 64_000_000.
    expect(MAX_IMAGE_PIXELS).toBe(64_000_000);
  });
});

describe('IMAGE_MAX_EDGE', () => {
  it('is the backend sharp resize box: 1600 px long edge (spec §3a)', () => {
    // Single-sourced ceiling: the API's sharp resize box AND the web pre-upload compression both read
    // this one number, so they can never drift. Raising it later raises both at once.
    expect(IMAGE_MAX_EDGE).toBe(1600);
  });
});
