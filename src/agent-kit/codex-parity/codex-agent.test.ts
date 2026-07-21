import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";

import {
  assertCodexAgentName,
  parseAgentMarkdown,
  renderCodexAgentToml,
  sandboxModeForTools,
  toCodexAgent,
} from "./codex-agent";

const VALID_MD = `---
name: plant_researcher
description: Researches one species and drafts a curated record.
tools: Read
---

You research ONE plant species and return drafts.

- You are read-only.
`;

describe("parseAgentMarkdown", () => {
  it("reads the frontmatter and the body", () => {
    const def = parseAgentMarkdown(VALID_MD, "plant_researcher.md");
    expect(def.name).toBe("plant_researcher");
    expect(def.description).toBe("Researches one species and drafts a curated record.");
    expect(def.tools).toEqual(["Read"]);
  });

  it("extracts the body byte-for-byte, keeping the trailing newline", () => {
    const def = parseAgentMarkdown(VALID_MD, "plant_researcher.md");
    expect(def.body).toBe("You research ONE plant species and return drafts.\n\n- You are read-only.\n");
    expect(VALID_MD.endsWith(def.body)).toBe(true);
  });

  it("keeps leading indentation and trailing whitespace inside the body", () => {
    const md = "---\nname: x\ndescription: d\ntools: Read\n---\n\n    indented\ntrailing   \n";
    expect(parseAgentMarkdown(md, "x.md").body).toBe("    indented\ntrailing   \n");
  });

  it("drops exactly ONE blank-line newline, not a second", () => {
    const md = "---\nname: x\ndescription: d\ntools: Read\n---\n\n\nbody\n";
    expect(parseAgentMarkdown(md, "x.md").body).toBe("\nbody\n");
  });

  it("splits a multi-tool list", () => {
    const md = VALID_MD.replace("tools: Read", "tools: WebSearch, WebFetch, Read");
    expect(parseAgentMarkdown(md, "plant_researcher.md").tools).toEqual(["WebSearch", "WebFetch", "Read"]);
  });

  it("normalizes CRLF", () => {
    expect(parseAgentMarkdown(VALID_MD.replace(/\n/g, "\r\n"), "plant_researcher.md").body).not.toContain("\r");
  });

  it("fails on missing frontmatter / name / description / tools / empty body", () => {
    expect(() => parseAgentMarkdown("no frontmatter", "x.md")).toThrow(/frontmatter/i);
    expect(() => parseAgentMarkdown(VALID_MD.replace("name: plant_researcher\n", ""), "x.md")).toThrow(/name/i);
    expect(() => parseAgentMarkdown(VALID_MD.replace("description: Researches one species and drafts a curated record.\n", ""), "plant_researcher.md")).toThrow(/description/i);
    expect(() => parseAgentMarkdown(VALID_MD.replace("tools: Read\n", ""), "plant_researcher.md")).toThrow(/tools/i);
    expect(() => parseAgentMarkdown("---\nname: x\ndescription: d\ntools: Read\n---\n\n   \n", "x.md")).toThrow(/body/i);
  });

  it("fails on a hyphenated name and on a name!=file mismatch", () => {
    expect(() => parseAgentMarkdown(VALID_MD.replace("name: plant_researcher", "name: plant-researcher"), "plant-researcher.md")).toThrow(/valid Codex agent name/i);
    expect(() => parseAgentMarkdown(VALID_MD.replace("name: plant_researcher", "name: other"), "plant_researcher.md")).toThrow(/must match its file name/i);
  });
});

describe("assertCodexAgentName", () => {
  it("accepts snake_case, rejects the rest", () => {
    expect(() => assertCodexAgentName("plant_researcher", "x.md")).not.toThrow();
    for (const bad of ["plant-researcher", "Plant_Researcher", "1x", "a b"]) {
      expect(() => assertCodexAgentName(bad, "x.md")).toThrow(/valid Codex agent name/i);
    }
  });
});

describe("sandboxModeForTools", () => {
  it("maps the read-only tool sets, order-independent", () => {
    expect(sandboxModeForTools(["Read"], "x.md")).toBe("read-only");
    expect(sandboxModeForTools(["WebSearch", "WebFetch", "Read"], "x.md")).toBe("read-only");
    expect(sandboxModeForTools(["Read", "WebFetch", "WebSearch"], "x.md")).toBe("read-only");
  });

  it("FAILS on an unknown set instead of guessing", () => {
    expect(() => sandboxModeForTools(["Read", "Bash"], "weird.md")).toThrow(/unknown tools set/i);
  });
});

describe("renderCodexAgentToml", () => {
  const agent = toCodexAgent(parseAgentMarkdown(VALID_MD, "plant_researcher.md"));

  it("emits the required keys + unenforced sandbox_mode, no model pin", () => {
    const parsed = parseToml(renderCodexAgentToml(agent)) as Record<string, unknown>;
    expect(parsed.name).toBe("plant_researcher");
    expect(parsed.sandbox_mode).toBe("read-only");
    expect(parsed.developer_instructions).toBe(agent.body);
    expect(parsed.model).toBeUndefined();
  });

  it("carries a provenance header and is deterministic", () => {
    expect(renderCodexAgentToml(agent)).toContain("# GENERATED FROM .claude/agents/plant_researcher.md — DO NOT EDIT.");
    expect(renderCodexAgentToml(agent)).toBe(renderCodexAgentToml(agent));
  });

  const adversarial: Array<[string, string]> = [
    ["a body that IS a triple quote", '"""'],
    ["six quotes", '""""""'],
    ["a trailing backslash", "ends with a backslash \\"],
    ["a literal backslash-n", "prints a literal \\n"],
    ["a trailing quote before newline", 'ends with a quote "\n'],
    ["fenced code + tabs", '```ts\nconst a = "b";\n```\n\n\tindented\n'],
    ["a trailing newline", "the prompt.\n"],
    ["trailing spaces", "the prompt.   "],
  ];

  it.each(adversarial)("round-trips %s through a real TOML parser", (_label, body) => {
    const parsed = parseToml(renderCodexAgentToml({ ...agent, body })) as Record<string, unknown>;
    expect(parsed.developer_instructions).toBe(body);
  });
});
