// The single source of truth for the createPlant idempotency HTTP header name. Both the API's
// idempotency interceptor and the web (the BFF proxy AND the browser client) import this constant
// instead of a local literal, so the header name can never drift between the two sides of the
// request. A POST carrying this header is deduped server-side: a retried request with the same key
// returns the original result instead of creating a duplicate plant. Zod-FREE by design (like
// image-limits.ts) so it never drags Zod into the web bundle.
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
