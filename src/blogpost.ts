// The Zod layer of the blogpost contract. Imported from the package ROOT export by the API and the
// knowledge-engine (which want the schema); the web imports only the Zod-free constants via the
// subpath, so Zod stays out of the client bundle.
import { z } from 'zod';
import { BlogpostStatus } from './blogpost-constants.js';

export const blogpostStatusSchema = z.union([z.literal(0), z.literal(1)]);

// Canonical create/upsert shape both writers satisfy (the KE validates its raw-SQL payload against it
// before insert, the way it already validates the record with safeParseSpeciesRecord; the API MAY
// re-parse as defense-in-depth). Spanish leads (required); English optional (nullable), matching the
// existing brief/i18n model.
export const blogpostInputSchema = z.object({
  slug: z.string().min(1),
  speciesSlug: z.string().min(1).nullable().default(null),
  status: blogpostStatusSchema.default(BlogpostStatus.DRAFT),
  titleEs: z.string().min(1),
  titleEn: z.string().min(1).nullable().default(null),
  excerptEs: z.string().min(1),
  excerptEn: z.string().min(1).nullable().default(null),
  bodyEs: z.string().min(1),
  bodyEn: z.string().min(1).nullable().default(null),
  coverImageUrl: z.string().url().nullable().default(null),
  coverImageObjectKey: z.string().min(1).nullable().default(null),
  // Cover-image (OG) generation prompt. Language-neutral (the cover subject is visual, not textual),
  // so it is a SINGLE field — deliberately unlike title/excerpt/body. Nullable: legacy posts and
  // human-created free-form posts may have none. Authored by the editorial-writer, kept read-only in
  // the writing desk, and never edited by hand.
  coverImagePrompt: z.string().min(1).nullable().default(null),
  youtubeUrl: z.string().url().nullable().default(null),
  ctaLink: z.string().url().nullable().default(null),
  ctaLabelEs: z.string().min(1).nullable().default(null),
  ctaLabelEn: z.string().min(1).nullable().default(null),
});
export type BlogpostInput = z.infer<typeof blogpostInputSchema>;
