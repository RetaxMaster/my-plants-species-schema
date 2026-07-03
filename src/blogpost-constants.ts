// Client-safe blogpost constants — Zod-FREE (no `import { z }`). The web (Spec 3) imports these via
// the package subpath "@retaxmaster/my-plants-species-schema/blogpost-constants" so Zod never enters
// its client bundle. Depends only on the shared slug core.
import { slugify } from './slug.js';

// Persisted as a small integer, exactly 0 or 1, per the product decision.
export const BlogpostStatus = { DRAFT: 0, PUBLISHED: 1 } as const;
export type BlogpostStatus = (typeof BlogpostStatus)[keyof typeof BlogpostStatus]; // 0 | 1

// A blogpost draft carries a cover-image prompt at the TOP of the leading-language (ES) body, wrapped
// in this HTML-comment-delimited block. The human generates the cover, deletes the block, then
// publishes. HTML comments so a previewed draft renders the block invisibly; detection is a plain
// substring search on the open delimiter.
export const THUMBNAIL_PROMPT_OPEN = '<!-- THUMBNAIL-PROMPT';
export const THUMBNAIL_PROMPT_CLOSE = 'THUMBNAIL-PROMPT -->';
export function hasThumbnailPrompt(body: string | null | undefined): boolean {
  return !!body && body.includes(THUMBNAIL_PROMPT_OPEN);
}

// Slug for a free-form blogpost, derived from its leading-language title. Same normalization as
// toSpeciesSlug (shared slugify core → no fork). Species-linked posts instead reuse `slug ===
// speciesSlug`; the service handles collision suffixing for free-form slugs.
export function toBlogpostSlug(title: string): string {
  const slug = slugify(title);
  if (slug.length === 0) {
    throw new Error(`Cannot derive a slug from title: ${JSON.stringify(title)}`);
  }
  return slug;
}
