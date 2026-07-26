import { describe, expect, it } from 'vitest';
import { IDEMPOTENCY_KEY_HEADER } from './idempotency-constants.js';

describe('IDEMPOTENCY_KEY_HEADER', () => {
  it('is the canonical "Idempotency-Key" header name (RFC/Stripe convention)', () => {
    // Single-sourced header name: the API interceptor AND the web (BFF proxy + client) all read
    // this one string, so they can never drift on casing or spelling.
    expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
  });
});
