import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The regression class this file exists to catch: `generate-codex-agents.ts` guards its entry point
 * with `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)`. npm installs the package's
 * `bin` as a SYMLINK under `node_modules/.bin/`. Node leaves `process.argv[1]` as that symlink path
 * while `import.meta.url` resolves to the target's realpath — so through an installed bin the two can
 * never be equal, `invokedDirectly` is permanently false, `main()` never runs, and the CLI silently
 * exits 0 having done nothing.
 *
 * `generate-codex-agents.test.ts` (the sibling file) exercises `syncCodexAgents` by importing the TS
 * source directly and calling the function — exactly the shape that let the real bug ship unnoticed:
 * it never invokes the BUILT artifact, let alone through a symlink, so it cannot see argv[1]/import.meta.url
 * disagree. This file closes that gap: it builds the package for real, links the built CLI exactly the
 * way `node_modules/.bin` does, and runs it as a genuine child process. A version that only ever
 * asserts "exit code 0" would still pass on the broken build (exit 0 IS the broken build's symptom), so
 * every assertion below also checks for observable work: a file actually written to disk, or a specific
 * problem actually named in the output.
 */

const PACKAGE_ROOT = process.cwd();
const BUILT_CLI = path.join(PACKAGE_ROOT, "dist/agent-kit/cli/generate-codex-agents.js");

let binDir: string;
let symlinkPath: string;

beforeAll(async () => {
  // Build for real — a stale dist/ would make this whole test meaningless.
  await execa("npm", ["run", "build"], { cwd: PACKAGE_ROOT, timeout: 120_000 });
  expect(existsSync(BUILT_CLI)).toBe(true);

  // npm chmods a `bin` entry to executable on install; a fresh `tsc` build does not. Replicate the
  // install-time step so invoking the symlink directly (via its shebang) behaves like the real bin.
  chmodSync(BUILT_CLI, 0o755);

  // Mimic node_modules/.bin/<name> -> ../@scope/pkg/dist/....js EXACTLY: a symlink, at a different
  // filesystem path than the realpath of its target, so process.argv[1] (the symlink path the OS hands
  // to node when it resolves the shebang) and import.meta.url (the target's realpath) can disagree.
  binDir = mkdtempSync(path.join(tmpdir(), "codex-agents-bindir-"));
  symlinkPath = path.join(binDir, "agent-kit-codex-agents");
  symlinkSync(BUILT_CLI, symlinkPath);
}, 120_000);

afterAll(() => {
  if (binDir) rmSync(binDir, { recursive: true, force: true });
});

describe("the built CLI invoked through a node_modules/.bin-style symlink", () => {
  let fixtureRoot: string;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "codex-agents-fixture-"));
    mkdirSync(path.join(fixtureRoot, ".claude/agents"), { recursive: true });
    writeFileSync(
      path.join(fixtureRoot, ".claude/agents/probe_agent.md"),
      "---\nname: probe_agent\ndescription: A probe.\ntools: Read\n---\n\nProbe instructions.\n",
    );
  });

  afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  it("generate mode: actually runs and actually writes the .toml (not just exit 0)", async () => {
    const tomlPath = path.join(fixtureRoot, ".codex/agents/probe_agent.toml");
    expect(existsSync(tomlPath)).toBe(false);

    const run = await execa(symlinkPath, [], { cwd: fixtureRoot, reject: false });

    // On the buggy guard this exits 0 too — the whole point of the bug is a silent no-op success. The
    // assertions that actually distinguish "ran" from "silently didn't" are the output text and the
    // file materializing on disk.
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/wrote \.codex\/agents\/probe_agent\.toml/);
    expect(existsSync(tomlPath)).toBe(true);
    expect(readFileSync(tomlPath, "utf8")).toMatch(/name = "probe_agent"/);
  });

  it("check mode: reports OK once in sync", async () => {
    const run = await execa(symlinkPath, ["--check"], { cwd: fixtureRoot, reject: false });
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/agents:check OK/);
  });

  it("check mode: FAILS and names the stale file once the source drifts", async () => {
    writeFileSync(
      path.join(fixtureRoot, ".claude/agents/probe_agent.md"),
      "---\nname: probe_agent\ndescription: A probe.\ntools: Read\n---\n\nProbe instructions, revised.\n",
    );

    const run = await execa(symlinkPath, ["--check"], { cwd: fixtureRoot, reject: false });

    // The buggy guard exits 0 here too, silently, with zero output — this is the exact case reported in
    // production: `agents:check` is the drift gate, and a drifted repo must fail LOUDLY, naming the file.
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toMatch(/probe_agent\.toml is STALE/);
  });
});
