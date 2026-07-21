import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GuidePairOptions {
  repoRoot: string;
  /** Build the anchored full-line regex a file's self-reference must match. `self` names the file being
   * checked, `peer` its sibling — COUPLED on purpose: "`AGENTS.md` … its peer `AGENTS.md`" is the
   * copy-paste slip this guard exists to catch and must NOT be exempted. */
  selfReferencePattern: (self: 'CLAUDE' | 'AGENTS', peer: 'CLAUDE' | 'AGENTS') => RegExp;
  /** Extra lines a repo legitimately allows to differ, by 1-based line number. The H1 (line 1) is always
   * exempt and is not asked about. Default: nothing else. */
  isExemptLine?: (lineNumber: number, claudeLine: string, agentsLine: string) => boolean;
}

export interface GuidePairResult { problems: string[]; selfReferenceLinesSeen: number; }

/**
 * Asserts WHOLE-FILE BYTE EQUALITY between a repo's CLAUDE.md and AGENTS.md, exempting only the H1 and
 * the one correctly-paired self-reference line.
 *
 * ⚠️ This is STRONGER than the workspace's stated intent-parity rule, deliberately: both existing agent
 * pairs satisfy the strong form by stating BOTH runtimes' delegation syntax in BOTH files. An agent-repo
 * author who writes genuinely runtime-divergent files will fail here, and that is the intended outcome —
 * parity a test can fail on beats parity a reviewer has to notice.
 */
export function checkGuidePair(options: GuidePairOptions): GuidePairResult {
  const claudeLines = readFileSync(join(options.repoRoot, 'CLAUDE.md'), 'utf8').split('\n');
  const agentsLines = readFileSync(join(options.repoRoot, 'AGENTS.md'), 'utf8').split('\n');
  const problems: string[] = [];
  if (claudeLines.length !== agentsLines.length) {
    problems.push(`line counts differ: CLAUDE.md ${claudeLines.length}, AGENTS.md ${agentsLines.length}`);
    return { problems, selfReferenceLinesSeen: 0 };
  }
  const claudeSelf = options.selfReferencePattern('CLAUDE', 'AGENTS');
  const agentsSelf = options.selfReferencePattern('AGENTS', 'CLAUDE');
  let selfReferenceLinesSeen = 0;
  for (let i = 0; i < claudeLines.length; i++) {
    const n = i + 1;
    const c = claudeLines[i]!, a = agentsLines[i]!;
    if (n === 1) continue;
    if (claudeSelf.test(c) && agentsSelf.test(a)) { selfReferenceLinesSeen++; continue; }
    if (options.isExemptLine?.(n, c, a)) continue;
    if (c !== a) problems.push(`line ${n} differs:\n  CLAUDE.md: ${c}\n  AGENTS.md: ${a}`);
  }
  return { problems, selfReferenceLinesSeen };
}
