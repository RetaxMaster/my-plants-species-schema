import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkTypedDelegationContract } from "./codex-delegation";
import { syncCodexAgents } from "../cli/generate-codex-agents";

/**
 * The two repo-level Codex-parity checks (§8.2 Rule 2), shared by every agent repo:
 * `.claude/agents` ↔ `.codex/agents` sync (`assertCodexAgentsMatchSource`) and the typed-delegation-contract
 * check (`assertTypedDelegationContract`). Each source repo's own version of these checks differed from the
 * other ONLY in which repo it asserted about — a genuine per-repo difference, carried here as the `label` +
 * `repoRoot` parameters rather than forked into a second file (see repos/my-plants-plant-doctor's
 * `scripts/codex-agents.test.ts` / `scripts/codex-delegation.test.ts`, pre-extraction).
 *
 * The fixture-based describe blocks below test `syncCodexAgents` / `checkTypedDelegationContract` against
 * synthetic temp directories — repo-agnostic behavior of the functions themselves, not of any real repo —
 * and are carried over verbatim alongside the two repo-facing assertions so no coverage is lost in the move.
 */

describe("syncCodexAgents (fixtures)", () => {
  let root: string;

  const agentMd = (tools: string, name = "probe_agent") =>
    `---\nname: ${name}\ndescription: A probe.\ntools: ${tools}\n---\n\nProbe instructions.\n`;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "codex-agents-"));
    mkdirSync(path.join(root, ".claude/agents"), { recursive: true });
    writeFileSync(path.join(root, ".claude/agents/probe_agent.md"), agentMd("Read"));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("writes the toml, then reports no problems", () => {
    const write = syncCodexAgents(root, "write");
    expect(write.problems).toEqual([]);
    expect(write.written).toEqual([".codex/agents/probe_agent.toml"]);
    expect(syncCodexAgents(root, "check").problems).toEqual([]);
  });

  it("is idempotent — a second write changes nothing", () => {
    syncCodexAgents(root, "write");
    expect(syncCodexAgents(root, "write").written).toEqual([]);
  });

  it("flags a MISSING toml in check mode (and writes nothing)", () => {
    expect(syncCodexAgents(root, "check").problems.join("\n")).toMatch(/probe_agent\.toml is MISSING/);
    expect(existsSync(path.join(root, ".codex/agents/probe_agent.toml"))).toBe(false);
  });

  it("flags a STALE toml when the prompt changed but nobody regenerated", () => {
    syncCodexAgents(root, "write");
    writeFileSync(
      path.join(root, ".claude/agents/probe_agent.md"),
      agentMd("Read").replace("Probe instructions.", "Probe instructions, revised."),
    );
    expect(syncCodexAgents(root, "check").problems.join("\n")).toMatch(/is STALE/);
  });

  it("flags a stale artifact whose source is gone, and removes it on write", () => {
    syncCodexAgents(root, "write");
    writeFileSync(
      path.join(root, ".codex/agents/ghost.toml"),
      '# GENERATED FROM .claude/agents/ghost.md — DO NOT EDIT.\nname = "ghost"\n',
    );
    expect(syncCodexAgents(root, "check").problems.join("\n")).toMatch(/ghost\.toml is a STALE/);
    syncCodexAgents(root, "write");
    expect(existsSync(path.join(root, ".codex/agents/ghost.toml"))).toBe(false);
  });

  it("refuses — but never deletes — a toml it did not generate", () => {
    syncCodexAgents(root, "write");
    const handmade = path.join(root, ".codex/agents/handmade.toml");
    writeFileSync(handmade, 'name = "handmade"\n');
    expect(syncCodexAgents(root, "check").problems.join("\n")).toMatch(/will not touch it/);
    expect(syncCodexAgents(root, "write").problems.join("\n")).toMatch(/will not touch it/);
    expect(existsSync(handmade)).toBe(true);
  });

  it("refuses to CLOBBER a hand-written toml that collides with a .md source name (write mode)", () => {
    // A hand-written toml at the SAME name as a source .md must be refused, not overwritten (Spec 2 §2). This
    // is the name-collision case the orphan check above does NOT cover.
    mkdirSync(path.join(root, ".codex/agents"), { recursive: true });
    const collision = path.join(root, ".codex/agents/probe_agent.toml");
    const handContent = 'name = "probe_agent"\n# hand-written, no generated header\n';
    writeFileSync(collision, handContent);
    expect(syncCodexAgents(root, "check").problems.join("\n")).toMatch(/refusing to overwrite a hand-written file/);
    const write = syncCodexAgents(root, "write");
    expect(write.problems.join("\n")).toMatch(/refusing to overwrite a hand-written file/);
    expect(write.written).toEqual([]); // nothing written
    expect(readFileSync(collision, "utf8")).toBe(handContent); // byte-for-byte untouched
  });

  it("THROWS on an unknown tools set instead of guessing a sandbox", () => {
    writeFileSync(path.join(root, ".claude/agents/probe_agent.md"), agentMd("Read, Bash"));
    expect(() => syncCodexAgents(root, "write")).toThrow(/unknown tools set/i);
  });

  it("THROWS on a hyphenated agent name and on a name!=file mismatch", () => {
    writeFileSync(path.join(root, ".claude/agents/probe_agent.md"), agentMd("Read").replace("name: probe_agent", "name: probe-agent"));
    expect(() => syncCodexAgents(root, "write")).toThrow(/valid Codex agent name/i);
    writeFileSync(path.join(root, ".claude/agents/probe_agent.md"), agentMd("Read", "other_agent"));
    expect(() => syncCodexAgents(root, "write")).toThrow(/must match its file name/i);
  });

  it("projects the body byte-for-byte (no trim) into developer_instructions", () => {
    writeFileSync(
      path.join(root, ".claude/agents/probe_agent.md"),
      "---\nname: probe_agent\ndescription: A probe.\ntools: Read\n---\n\nProbe instructions.   \n",
    );
    syncCodexAgents(root, "write");
    const toml = readFileSync(path.join(root, ".codex/agents/probe_agent.toml"), "utf8");
    expect(parseToml(toml).developer_instructions).toBe("Probe instructions.   \n");
  });
});

/**
 * The repo-level Codex-agents parity assertion, shared by every agent repo. Each repo keeps its own
 * one-line `*.test.ts` so its vitest run discovers a file, and passes its root + a human label.
 * `label` is the ONLY per-repo difference and is therefore a parameter (project fork-prevention rule).
 */
export function assertCodexAgentsMatchSource(label: string, repoRoot: string): void {
  expect(syncCodexAgents(repoRoot, "check").problems).toEqual([]);
}

const CONFIG = `[features.multi_agent_v2]
enabled = true
hide_spawn_agent_metadata = false
tool_namespace = "agents"
`;

const CALL = `spawn_agent(task_name="research_run_r1", agent_type="plant_researcher", message="Research.", fork_turns="none")`;

describe("typed Codex delegation contract", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "codex-delegation-"));
    mkdirSync(path.join(root, ".codex"), { recursive: true });
    writeFileSync(path.join(root, ".codex/config.toml"), CONFIG);
    writeFileSync(path.join(root, "CLAUDE.md"), `On Codex: ${CALL}\n`);
    writeFileSync(path.join(root, "AGENTS.md"), `On Codex: ${CALL}\n`);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("is green when every role is exercised", () => {
    expect(checkTypedDelegationContract(root, ["plant_researcher"])).toEqual([]);
  });

  it("detects hidden spawn metadata", () => {
    writeFileSync(path.join(root, ".codex/config.toml"), CONFIG.replace("hide_spawn_agent_metadata = false", "hide_spawn_agent_metadata = true"));
    expect(checkTypedDelegationContract(root, ["plant_researcher"]).join("\n")).toMatch(/hide_spawn_agent_metadata must be false/);
  });

  it("detects task_name without agent_type", () => {
    writeFileSync(path.join(root, "CLAUDE.md"), CALL.replace('agent_type="plant_researcher", ', ""));
    writeFileSync(path.join(root, "AGENTS.md"), CALL.replace('agent_type="plant_researcher", ', ""));
    expect(checkTypedDelegationContract(root, ["plant_researcher"]).join("\n")).toMatch(/task_name without agent_type/);
  });

  it("detects fork_turns=all", () => {
    writeFileSync(path.join(root, "CLAUDE.md"), CALL.replace('fork_turns="none"', 'fork_turns="all"'));
    writeFileSync(path.join(root, "AGENTS.md"), CALL.replace('fork_turns="none"', 'fork_turns="all"'));
    expect(checkTypedDelegationContract(root, ["plant_researcher"]).join("\n")).toMatch(/forbidden fork_turns="all"/);
  });

  it("detects an unknown agent_type", () => {
    expect(checkTypedDelegationContract(root, ["editorial_writer"]).join("\n")).toMatch(/unknown agent_type "plant_researcher"/);
  });

  it("detects a role never demonstrated", () => {
    expect(checkTypedDelegationContract(root, ["plant_researcher", "editorial_writer"]).join("\n")).toMatch(/no operator guide demonstrates agent_type="editorial_writer"/);
  });
});

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
