import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { syncCodexAgents } from "./generate-codex-agents";

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
