// Canonical slug core. NFKD → strip diacritics (combining marks) → lowercase → non-alnum → '-'
// → trim leading/trailing '-'. Zod-free so BOTH the Zod-free blogpost-constants module and this
// module can reuse it — the derivation never forks (no-new-forks rule). May return '' when the
// input has no slug-able characters; each caller decides how to handle empty.
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Canonical species slug. Imported by the knowledge engine (folder name) and the API (DB upsert key)
// so the derivation never forks. Throws when the scientific name yields nothing slug-able.
export function toSpeciesSlug(scientificName: string): string {
  const slug = slugify(scientificName);
  if (slug.length === 0) {
    throw new Error(`Cannot derive a slug from scientific name: ${JSON.stringify(scientificName)}`);
  }
  return slug;
}
