import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_PIXELS } from './image-limits.js';

describe('MAX_IMAGE_PIXELS', () => {
  it('is the deliberately-chosen 64 MP ceiling (spec §2)', () => {
    // 64 MP clears the iPhone 16 Pro Max 48 MP mode (48.8 MP) with ~31% headroom. Do NOT round this
    // to 64 * 1024 * 1024 — the spec's ledger value is decimal 64_000_000.
    expect(MAX_IMAGE_PIXELS).toBe(64_000_000);
  });
});
