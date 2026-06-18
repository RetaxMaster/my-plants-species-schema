// Canonical species slug. Imported by the knowledge engine (folder name) and the API
// (DB upsert key) so the derivation never forks.
export function toSpeciesSlug(scientificName: string): string {
  const slug = scientificName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length === 0) {
    throw new Error(`Cannot derive a slug from scientific name: ${JSON.stringify(scientificName)}`);
  }
  return slug;
}
