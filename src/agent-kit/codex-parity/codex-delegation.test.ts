import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkTypedDelegationContract } from "./codex-delegation";

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
