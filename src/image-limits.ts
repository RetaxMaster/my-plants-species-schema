// The maximum decoded pixel count (width × height) any uploaded image may have. This is a
// decompression-bomb guard, sized against the worst case (a full-buffer PNG decode ≈ pixels × 4 bytes)
// at the worker's concurrency-1 ceiling. Zod-FREE by design (like plant-profile-constants.ts) so it
// never drags Zod into the web bundle. See docs/superpowers/specs/2026-07-14-async-photo-pipeline-design.md §2.
export const MAX_IMAGE_PIXELS = 64_000_000; // 64 MP
