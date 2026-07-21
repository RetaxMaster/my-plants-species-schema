import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkGuidePair } from './guide-pair.js';

// A stand-in for the real repos' self-reference sentence, coupling `self`/`peer` the same way the
// reference implementation does (repos/my-plants-plant-doctor/scripts/guide-pair.test.ts:27-30).
const selfReferencePattern = (self: 'CLAUDE' | 'AGENTS', peer: 'CLAUDE' | 'AGENTS') =>
  new RegExp(`^This file is ${self}\\.md; its peer is ${peer}\\.md\\.$`);

function writeGuidePair(dir: string, claudeBody: string, agentsBody: string): void {
  writeFileSync(join(dir, 'CLAUDE.md'), `# CLAUDE\n${claudeBody}`);
  writeFileSync(join(dir, 'AGENTS.md'), `# AGENTS\n${agentsBody}`);
}

describe('checkGuidePair', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'guide-pair-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('passes an identical pair (apart from the H1 and the correctly-paired self-reference)', () => {
    writeGuidePair(
      dir,
      'This file is CLAUDE.md; its peer is AGENTS.md.\nSame rule body.\n',
      'This file is AGENTS.md; its peer is CLAUDE.md.\nSame rule body.\n',
    );

    const result = checkGuidePair({ repoRoot: dir, selfReferencePattern });

    expect(result.problems).toEqual([]);
    expect(result.selfReferenceLinesSeen).toBe(1);
  });

  it('reports a differing body line', () => {
    writeGuidePair(
      dir,
      'This file is CLAUDE.md; its peer is AGENTS.md.\nRule: water on Monday.\n',
      'This file is AGENTS.md; its peer is CLAUDE.md.\nRule: water on Tuesday.\n',
    );

    const result = checkGuidePair({ repoRoot: dir, selfReferencePattern });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('line 3 differs');
  });

  it('reports a mismatched line count', () => {
    writeGuidePair(
      dir,
      'This file is CLAUDE.md; its peer is AGENTS.md.\nOne extra line.\nAnd another.\n',
      'This file is AGENTS.md; its peer is CLAUDE.md.\nOne extra line.\n',
    );

    const result = checkGuidePair({ repoRoot: dir, selfReferencePattern });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/line counts differ/);
    expect(result.selfReferenceLinesSeen).toBe(0);
  });

  it('the coupled-alternation guard: AGENTS.md naming itself as its own peer is reported, not exempted', () => {
    // The copy-paste slip this guard exists to catch: AGENTS.md's self-reference line wrongly says
    // "its peer is AGENTS.md" instead of "its peer is CLAUDE.md". Because selfReferencePattern couples
    // self+peer, this line fails BOTH the self-reference match and the plain equality check that would
    // otherwise let it slide as an ordinary differing line — it must show up as a reported problem and
    // selfReferenceLinesSeen must stay 0.
    writeGuidePair(
      dir,
      'This file is CLAUDE.md; its peer is AGENTS.md.\nSame rule body.\n',
      'This file is AGENTS.md; its peer is AGENTS.md.\nSame rule body.\n',
    );

    const result = checkGuidePair({ repoRoot: dir, selfReferencePattern });

    expect(result.selfReferenceLinesSeen).toBe(0);
    expect(result.problems).toHaveLength(2);
    expect(result.problems.some((p) => p.includes('line 2 differs'))).toBe(true);
    expect(result.problems.some((p) => /expected exactly one/.test(p))).toBe(true);
  });

  it('does NOT pass vacuously on a straight byte-for-byte copy where the self-reference was never adapted', () => {
    // The most common real slip: AGENTS.md is a literal `cp` of CLAUDE.md, so EVERY line — including the
    // self-reference sentence, which still says "This file is CLAUDE.md" in the AGENTS.md copy — trivially
    // satisfies the plain-equality fallback. Before this guard, that meant selfReferenceLinesSeen stayed 0
    // and problems stayed [] — a fully green result for a pair that was never actually adapted for AGENTS.
    const body = 'This file is CLAUDE.md; its peer is AGENTS.md.\nSame rule body.\n';
    writeGuidePair(dir, body, body);

    const result = checkGuidePair({ repoRoot: dir, selfReferencePattern });

    expect(result.selfReferenceLinesSeen).toBe(0);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems.some((p) => /expected exactly one/.test(p))).toBe(true);
  });
});
