import { describe, expect, it } from 'vitest';
import {
  REPOT_EVIDENCE_CLASSES,
  REPOT_SIGN_ID_MAX_LEN,
  REPOT_SIGN_ID_SEPARATOR,
  REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN,
  SPECIES_SLUG_MAX_LEN,
  UNIVERSAL_SIGN_NAMESPACE,
  composeSpeciesRepotSignId,
  composeUniversalRepotSignId,
  repotSignIdSchema,
  repotSignSemanticSlugSchema,
} from './repot-sign-constants.js';

describe('repot sign vocabulary', () => {
  it('lists the four ordinal evidence classes, strongest first', () => {
    expect(REPOT_EVIDENCE_CLASSES).toEqual(['definitive', 'strong', 'suggestive', 'ambiguous']);
  });
});

describe('the id width is DERIVED, never guessed', () => {
  it('is exactly speciesSlug + separator + semanticSlug', () => {
    expect(REPOT_SIGN_ID_MAX_LEN).toBe(
      SPECIES_SLUG_MAX_LEN + REPOT_SIGN_ID_SEPARATOR.length + REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN,
    );
    expect(REPOT_SIGN_ID_MAX_LEN).toBe(257); // pins the DDL's VARCHAR(257)
  });
});

describe('repotSignSemanticSlugSchema', () => {
  it('accepts a kebab slug', () => {
    expect(repotSignSemanticSlugSchema.safeParse('crowded-clump').success).toBe(true);
  });
  it('rejects the reserved separator inside the semantic half', () => {
    expect(repotSignSemanticSlugSchema.safeParse('crowded--clump').success).toBe(false);
  });
  it('rejects uppercase, spaces, leading/trailing dashes and empties', () => {
    for (const bad of ['Crowded', 'crowded clump', '-clump', 'clump-', '']) {
      expect(repotSignSemanticSlugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it(`rejects a slug over ${REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN} characters`, () => {
    expect(repotSignSemanticSlugSchema.safeParse('a'.repeat(REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN)).success).toBe(true);
    expect(repotSignSemanticSlugSchema.safeParse('a'.repeat(REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN + 1)).success).toBe(false);
  });
});

describe('composeSpeciesRepotSignId / composeUniversalRepotSignId', () => {
  it('namespaces a species row', () => {
    expect(composeSpeciesRepotSignId('spider-plant', 'crowded-clump')).toBe('spider-plant--crowded-clump');
  });
  it('namespaces a universal row', () => {
    expect(composeUniversalRepotSignId('water-runs-through')).toBe('universal--water-runs-through');
  });
  it('a species row echoing a universal slug does NOT collide with the universal row', () => {
    expect(composeSpeciesRepotSignId('spider-plant', 'water-runs-through')).not.toBe(
      composeUniversalRepotSignId('water-runs-through'),
    );
  });
  it('two species proposing the SAME semantic slug produce two distinct ids', () => {
    expect(composeSpeciesRepotSignId('spider-plant', 'crowded-clump')).not.toBe(
      composeSpeciesRepotSignId('monstera-deliciosa', 'crowded-clump'),
    );
  });
  it('throws on an invalid semantic slug rather than composing a bad id', () => {
    expect(() => composeSpeciesRepotSignId('spider-plant', 'crowded--clump')).toThrow(/semantic slug/i);
  });
  it('throws when the composed id would exceed the derived ceiling', () => {
    const longSpecies = 'a'.repeat(SPECIES_SLUG_MAX_LEN + 1);
    expect(() => composeSpeciesRepotSignId(longSpecies, 'x')).toThrow(/257/);
  });
  it(`throws when a species slug is literally "${UNIVERSAL_SIGN_NAMESPACE}" instead of silently colliding with the universal namespace`, () => {
    expect(() => composeSpeciesRepotSignId(UNIVERSAL_SIGN_NAMESPACE, 'crowded-clump')).toThrow(
      /reserved for the universal namespace/i,
    );
    // Proof it would otherwise have collided bit-for-bit with the real universal id:
    expect(`${UNIVERSAL_SIGN_NAMESPACE}${REPOT_SIGN_ID_SEPARATOR}crowded-clump`).toBe(
      composeUniversalRepotSignId('crowded-clump'),
    );
  });
});

describe('repotSignIdSchema re-validates the COMPOSED id', () => {
  it('accepts a well-formed composed id', () => {
    expect(repotSignIdSchema.safeParse('universal--water-runs-through').success).toBe(true);
  });
  it('rejects an id with no namespace separator', () => {
    expect(repotSignIdSchema.safeParse('water-runs-through').success).toBe(false);
  });
  it(`rejects an id longer than ${REPOT_SIGN_ID_MAX_LEN}`, () => {
    const tooLong = `${'a'.repeat(SPECIES_SLUG_MAX_LEN)}--${'b'.repeat(REPOT_SIGN_SEMANTIC_SLUG_MAX_LEN + 1)}`;
    expect(repotSignIdSchema.safeParse(tooLong).success).toBe(false);
  });
});
