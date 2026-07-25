// The maximum decoded pixel count (width × height) any uploaded image may have. This is a
// decompression-bomb guard, sized against the worst case (a full-buffer PNG decode ≈ pixels × 4 bytes)
// at the worker's concurrency-1 ceiling. Zod-FREE by design (like plant-profile-constants.ts) so it
// never drags Zod into the web bundle. See docs/superpowers/specs/2026-07-14-async-photo-pipeline-design.md §2.
export const MAX_IMAGE_PIXELS = 64_000_000; // 64 MP

// The long-edge ceiling (px) for uploaded images. The API's `sharp` resize fits every image inside an
// IMAGE_MAX_EDGE × IMAGE_MAX_EDGE box, and the web pre-compresses to the SAME long edge before upload, so
// the two can never drift: raising this raises both at once. Zod-FREE (like MAX_IMAGE_PIXELS) so it never
// drags Zod into the web bundle. See docs/superpowers/specs/2026-07-25-frontend-image-compression-design.md §3a.
export const IMAGE_MAX_EDGE = 1600;
