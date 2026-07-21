#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAgentMarkdown, renderCodexAgentToml, toCodexAgent } from "../codex-parity/codex-agent.js";
import { agentRepoRoot } from "./repo-root.js";

/**
 * Projects every Claude subagent (`.claude/agents/<name>.md`) into its Codex twin
 * (`.codex/agents/<name>.toml`).
 *
 *   npm run agents:generate   → writes the TOMLs
 *   npm run agents:check      → writes nothing; exits non-zero on ANY drift
 *
 * The markdown is the source of truth. NEVER hand-edit a .toml.
 */

const REPO_ROOT = agentRepoRoot();

const CLAUDE_AGENTS = ".claude/agents";
const CODEX_AGENTS = ".codex/agents";

/** Every file we write starts with this. A .toml without it was NOT written by us. */
const GENERATED_MARKER = "# GENERATED FROM ";

export type SyncMode = "write" | "check";

export interface SyncResult {
  problems: string[];
  written: string[];
}

export function syncCodexAgents(repoRoot: string, mode: SyncMode): SyncResult {
  const problems: string[] = [];
  const written: string[] = [];

  const agentsDir = path.join(repoRoot, CLAUDE_AGENTS);
  const codexDir = path.join(repoRoot, CODEX_AGENTS);

  const sources = readdirSync(agentsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();
  if (sources.length === 0) {
    throw new Error(`${CLAUDE_AGENTS}/: no subagent definitions found — nothing to project.`);
  }

  // 1. Project every source. Any invalid agent THROWS (unknown tools set, missing field, invalid
  //    name, name != file, body that will not round-trip). We never write a guess.
  const expected = new Map<string, string>();
  for (const file of sources) {
    const agent = toCodexAgent(
      parseAgentMarkdown(readFileSync(path.join(agentsDir, file), "utf8"), file),
    );
    const tomlName = `${agent.name}.toml`;
    if (expected.has(tomlName)) {
      throw new Error(
        `duplicate agent name "${agent.name}" — two files in ${CLAUDE_AGENTS}/ declare it. Names must be unique.`,
      );
    }
    expected.set(tomlName, renderCodexAgentToml(agent));
  }

  if (mode === "write") {
    mkdirSync(codexDir, { recursive: true });
  } else if (!existsSync(codexDir)) {
    problems.push(`${CODEX_AGENTS}/ does not exist — run: npm run agents:generate`);
  }

  // 2. Missing or stale TOMLs.
  for (const [name, content] of expected) {
    const target = path.join(codexDir, name);
    const current = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (current === content) continue;

    // A pre-existing toml that carries NO generated-by header is hand-written and must never be clobbered —
    // even in write mode, even when a same-named .md source exists (Spec 2 §2: a hand-written toml is refused,
    // not overwritten). This is the same protection step 3 gives orphans, applied to a NAME COLLISION.
    if (current !== null && !current.startsWith(GENERATED_MARKER)) {
      problems.push(
        `${CODEX_AGENTS}/${name} already exists and carries no generated-by header — refusing to overwrite a hand-written file. Delete it or restore the "${GENERATED_MARKER.trim()}" header, then run: npm run agents:generate`,
      );
      continue;
    }

    if (mode === "write") {
      writeFileSync(target, content);
      written.push(`${CODEX_AGENTS}/${name}`);
      continue;
    }
    problems.push(
      current === null
        ? `${CODEX_AGENTS}/${name} is MISSING — run: npm run agents:generate`
        : `${CODEX_AGENTS}/${name} is STALE — it does not match ${CLAUDE_AGENTS}/. Run: npm run agents:generate`,
    );
  }

  // 3. Orphans: a .toml whose source agent no longer exists. Never delete a file we did not write.
  const present = existsSync(codexDir)
    ? readdirSync(codexDir).filter((file) => file.endsWith(".toml")).sort()
    : [];
  for (const name of present) {
    if (expected.has(name)) continue;

    const target = path.join(codexDir, name);
    const isOurs = readFileSync(target, "utf8").startsWith(GENERATED_MARKER);

    if (!isOurs) {
      problems.push(
        `${CODEX_AGENTS}/${name} has no source in ${CLAUDE_AGENTS}/ and carries no generated-by header, so this script will not touch it. Delete it, or add the matching ${CLAUDE_AGENTS}/*.md source.`,
      );
      continue;
    }
    if (mode === "write") {
      rmSync(target);
      written.push(`removed ${CODEX_AGENTS}/${name} (its source agent is gone)`);
      continue;
    }
    problems.push(
      `${CODEX_AGENTS}/${name} is a STALE artifact — no ${CLAUDE_AGENTS}/*.md generates it. Run: npm run agents:generate`,
    );
  }

  return { problems, written };
}

function main(argv: string[]): number {
  const mode: SyncMode = argv.includes("--check") ? "check" : "write";

  let result: SyncResult;
  try {
    result = syncCodexAgents(REPO_ROOT, mode);
  } catch (error) {
    console.error(`agents:${mode === "check" ? "check" : "generate"} FAILED`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  for (const entry of result.written) console.log(`wrote ${entry}`);

  if (result.problems.length > 0) {
    console.error(`\nagents:${mode === "check" ? "check" : "generate"} FAILED — ${result.problems.length} problem(s):`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error(`\n.codex/agents/*.toml are GENERATED from .claude/agents/*.md. Edit the markdown, then run: npm run agents:generate`);
    return 1;
  }

  console.log(
    mode === "check"
      ? `agents:check OK — ${CODEX_AGENTS} is in sync.`
      : `agents:generate OK — ${CODEX_AGENTS} is in sync.`,
  );
  return 0;
}

/**
 * Resolves a path's realpath, or undefined if it can't be resolved (missing, dangling symlink, etc).
 * Used instead of a bare equality check because npm installs a `bin` as a SYMLINK in
 * `node_modules/.bin/`: Node leaves `process.argv[1]` as that symlink path while `import.meta.url`
 * resolves to the target's real location, so a raw `path.resolve(argv[1]) === fileURLToPath(url)`
 * comparison can never match through an installed bin — `invokedDirectly` would be permanently false,
 * `main()` would never run, and the CLI would silently exit 0 having done nothing (a real incident: see
 * generate-codex-agents.test.ts's "invoked via a node_modules/.bin-style symlink" case).
 */
function tryRealpath(target: string): string | undefined {
  try {
    return realpathSync(target);
  } catch {
    return undefined;
  }
}

const invokedPath = process.argv[1] !== undefined ? tryRealpath(path.resolve(process.argv[1])) : undefined;
const modulePath = tryRealpath(fileURLToPath(import.meta.url));

const invokedDirectly = invokedPath !== undefined && modulePath !== undefined && invokedPath === modulePath;

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
