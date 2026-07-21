import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

/**
 * Projects a Claude subagent definition (`.claude/agents/<name>.md`) into a Codex
 * agent document (`.codex/agents/<name>.toml`).
 *
 * The markdown is the SOURCE OF TRUTH; the TOML is a generated artifact. Codex's format
 * cannot reference an external prompt file, so the projection is unavoidable — generating it
 * (instead of hand-writing it) makes drift impossible rather than merely discouraged.
 *
 * `sandbox_mode` is emitted but NOT relied upon: a sub-agent inherits the parent's sandbox.
 * It states intent; nothing may depend on it. This module is pure: no filesystem, no process.
 */

export type CodexSandboxMode = "read-only" | "workspace-write";

export interface AgentDefinition {
  /** Codex agent name (snake_case) — identical to the Claude frontmatter name AND the filename. */
  name: string;
  description: string;
  /** The Claude `tools` allowlist, split and trimmed. */
  tools: string[];
  /** The markdown body, VERBATIM (LF-canonical; minus the single structural blank-line newline). */
  body: string;
  /** The source file's basename, used in every error message. */
  sourceFile: string;
}

export interface CodexAgent extends AgentDefinition {
  sandboxMode: CodexSandboxMode;
}

/** `spawn_agent` accepts only lowercase letters, digits and underscores. Hyphens are rejected. */
const CODEX_AGENT_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * The `tools` → `sandbox_mode` map, keyed by the SORTED, comma-joined tool set.
 * Total over what every consumer currently declares. An unknown set fails the generator — a sandbox is never guessed.
 *
 * Tool sets are declared per role in each repo's own `.claude/agents/*.md` front matter; this projector
 * only translates them. Both existing agent repos declare exclusively READ-ONLY tool sets (Read,
 * WebFetch, WebSearch): the write tools are npm scripts the top-level operator runs, and the operator is
 * not a subagent. A `workspace-write` sandbox entry belongs here ONLY if a future subagent actually
 * declares a writing tool.
 */
const SANDBOX_BY_TOOLS: Readonly<Record<string, CodexSandboxMode>> = {
  Read: "read-only",
  "Read,WebFetch,WebSearch": "read-only",
};

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export function toolsKey(tools: string[]): string {
  return [...tools]
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0)
    .sort()
    .join(",");
}

export function sandboxModeForTools(tools: string[], sourceFile: string): CodexSandboxMode {
  const mode = SANDBOX_BY_TOOLS[toolsKey(tools)];
  if (!mode) {
    throw new Error(
      `${sourceFile}: unknown tools set [${tools.join(", ")}] — no sandbox_mode is mapped for it. ` +
        `The generator never guesses a sandbox: add the set to SANDBOX_BY_TOOLS in src/agent-kit/codex-parity/codex-agent.ts.`,
    );
  }
  return mode;
}

export function assertCodexAgentName(name: string, sourceFile: string): void {
  if (!CODEX_AGENT_NAME.test(name)) {
    throw new Error(
      `${sourceFile}: "${name}" is not a valid Codex agent name. ` +
        `spawn_agent accepts only lowercase letters, digits and underscores (hyphens are rejected). ` +
        `Rename the agent to snake_case on BOTH sides — one name everywhere.`,
    );
  }
}

/** ONE NAME EVERYWHERE — the file name is part of the identity. */
export function assertNameMatchesFile(name: string, sourceFile: string): void {
  const basename = sourceFile.replace(/\.md$/, "");
  if (basename !== name) {
    throw new Error(
      `${sourceFile}: the frontmatter name "${name}" must match its file name ("${basename}"). ` +
        `One name everywhere — the file, the frontmatter, and the generated .codex/agents/<name>.toml.`,
    );
  }
}

export function parseAgentMarkdown(source: string, sourceFile: string): AgentDefinition {
  const match = FRONTMATTER.exec(source.replace(/\r\n/g, "\n"));
  if (!match) {
    throw new Error(
      `${sourceFile}: missing YAML frontmatter — a subagent definition must start with a "---" block.`,
    );
  }

  const [, rawFrontmatter, rawBody] = match;
  const frontmatter = parseYaml(rawFrontmatter) as Record<string, unknown> | null;
  if (!frontmatter || typeof frontmatter !== "object") {
    throw new Error(`${sourceFile}: the frontmatter is not a YAML mapping.`);
  }

  const name = requireString(frontmatter.name, "name", sourceFile);
  const description = requireString(frontmatter.description, "description", sourceFile);
  const tools = requireString(frontmatter.tools, "tools", sourceFile);

  // The regex already consumed the closing "---\n"; drop ONLY the single conventional blank-line
  // newline. NO trim(): leading indentation and the trailing newline are part of the prompt.
  const body = rawBody.startsWith("\n") ? rawBody.slice(1) : rawBody;
  if (body.trim() === "") {
    throw new Error(`${sourceFile}: the body is empty — developer_instructions cannot be blank.`);
  }

  assertCodexAgentName(name, sourceFile);
  assertNameMatchesFile(name, sourceFile);

  return {
    name,
    description,
    tools: tools
      .split(",")
      .map((tool) => tool.trim())
      .filter((tool) => tool.length > 0),
    body,
    sourceFile,
  };
}

export function toCodexAgent(definition: AgentDefinition): CodexAgent {
  return {
    ...definition,
    sandboxMode: sandboxModeForTools(definition.tools, definition.sourceFile),
  };
}

/** A TOML single-line basic string. */
export function tomlBasicString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/**
 * A TOML multi-line basic string. EVERY double quote is escaped — that is what makes a run of
 * quotes unable to collide with the closing delimiter. TOML trims the newline after the opening
 * delimiter, so the value parses back with no leading newline.
 */
export function tomlMultilineString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"""\n${escaped}"""`;
}

/**
 * Renders one Codex agent TOML — and PARSES IT BACK with a real TOML parser, throwing if any
 * field does not survive the round-trip. A lossy prompt is a subagent missing half its doctrine.
 */
export function renderCodexAgentToml(agent: CodexAgent): string {
  const toml =
    `# GENERATED FROM .claude/agents/${agent.sourceFile} — DO NOT EDIT.\n` +
    `# Edit the markdown, then run: npm run agents:generate  (npm test fails when this file is stale)\n` +
    `# sandbox_mode is NOT enforced by Codex — a sub-agent inherits the parent's sandbox.\n` +
    `# It states intent; nothing may depend on it.\n` +
    `\n` +
    `name = ${tomlBasicString(agent.name)}\n` +
    `description = ${tomlBasicString(agent.description)}\n` +
    `sandbox_mode = ${tomlBasicString(agent.sandboxMode)}\n` +
    `developer_instructions = ${tomlMultilineString(agent.body)}\n`;

  const parsed = parseToml(toml) as Record<string, unknown>;
  const mismatch =
    parsed.name !== agent.name ||
    parsed.description !== agent.description ||
    parsed.sandbox_mode !== agent.sandboxMode ||
    parsed.developer_instructions !== agent.body;

  if (mismatch) {
    throw new Error(
      `${agent.sourceFile}: the agent does not round-trip through TOML. Refusing to write a lossy prompt.`,
    );
  }

  return toml;
}

function requireString(value: unknown, field: string, sourceFile: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${sourceFile}: the frontmatter is missing a non-empty "${field}" (Codex requires it).`,
    );
  }
  return value.trim();
}
