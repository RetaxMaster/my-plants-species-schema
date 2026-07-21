import { readdirSync } from "node:fs";
import path from "node:path";

import { expect } from "vitest";

import { checkTypedDelegationContract } from "./codex-delegation";
import { syncCodexAgents } from "../cli/generate-codex-agents";

/**
 * ⚠️ TEST-ONLY MODULE — imports `vitest`. `vitest` is only ever installed as a devDependency, and
 * importing it (even just `expect`) OUTSIDE an active `vitest` worker process crashes immediately
 * ("Vitest failed to access its internal state"), before any code here even runs. This module must
 * NEVER be re-exported from a barrel that non-test runtime code can reach (e.g. the `codex-parity`
 * barrel that also carries `verification-record`, which IS read by non-test CLI code) — doing so
 * would crash that consumer at import time. It gets its own narrow subpath export instead (Task 3.9).
 *
 * The repo-level Codex-parity assertions, shared by every agent repo (§8.2 Rule 2). Each source
 * repo's own version of these checks differed from the other ONLY in which repo it asserted about —
 * a genuine per-repo difference, carried here as the `label` + `repoRoot` parameters rather than
 * forked into a second file. `label` is accepted for symmetry with the per-repo caller (which uses it
 * to title its own `describe()`); neither assertion body below hardcodes the repo's identity in a
 * message, so there is nothing to interpolate.
 *
 * ⚠️ CONSEQUENCE FOR EVERY CALLER, and it is load-bearing: because `label` is not interpolated into
 * any assertion message, a failure raised here says WHAT broke but not WHICH repo it broke in. With
 * three agent repos calling the same two functions, that attribution comes entirely from the caller's
 * test shape — so each repo's one-line `*.test.ts` MUST wrap the call in a `describe(label, …)` whose
 * title carries the repo's identity. Drop that and a red run in CI names a role and a file path with
 * no way to tell whose tree is out of sync.
 */

/**
 * The repo-level Codex-agents parity assertion, shared by every agent repo. Each repo keeps its own
 * one-line `*.test.ts` so its vitest run discovers a file, and passes its root + a human label.
 * `label` is the ONLY per-repo difference and is therefore a parameter (project fork-prevention rule).
 */
export function assertCodexAgentsMatchSource(label: string, repoRoot: string): void {
  expect(syncCodexAgents(repoRoot, "check").problems).toEqual([]);
}

/**
 * The repo-level typed-delegation-contract assertion, shared by every agent repo. Each repo keeps its own
 * one-line `*.test.ts` so its vitest run discovers a file, and passes its root + a human label.
 * `label` is the ONLY per-repo difference and is therefore a parameter (project fork-prevention rule).
 */
export function assertTypedDelegationContract(label: string, repoRoot: string): void {
  const roles = readdirSync(path.join(repoRoot, ".codex/agents"))
    .filter((f) => f.endsWith(".toml"))
    .map((f) => f.slice(0, -".toml".length));
  expect(checkTypedDelegationContract(repoRoot, roles)).toEqual([]);
}
