import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseToml } from "smol-toml";

const CONFIG_PATH = ".codex/config.toml";
/** The operator guides that document how this repo delegates. Personas live here, not in a skill. */
const GUIDE_FILES = ["CLAUDE.md", "AGENTS.md"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkTypedDelegationContract(
  repoRoot: string,
  expectedAgentNames: readonly string[],
): string[] {
  const problems: string[] = [];
  const configPath = path.join(repoRoot, CONFIG_PATH);

  if (!existsSync(configPath)) {
    problems.push(`${CONFIG_PATH} is missing.`);
  } else {
    const parsed = parseToml(readFileSync(configPath, "utf8"));
    const features = isRecord(parsed.features) ? parsed.features : undefined;
    const multiAgent =
      features && isRecord(features.multi_agent_v2) ? features.multi_agent_v2 : undefined;

    if (!multiAgent) {
      problems.push(`${CONFIG_PATH} must define the [features.multi_agent_v2] table.`);
    } else {
      if (multiAgent.enabled !== true) {
        problems.push(`${CONFIG_PATH}: features.multi_agent_v2.enabled must be true.`);
      }
      if (multiAgent.hide_spawn_agent_metadata !== false) {
        problems.push(
          `${CONFIG_PATH}: features.multi_agent_v2.hide_spawn_agent_metadata must be false so spawn_agent exposes agent_type.`,
        );
      }
      if (multiAgent.tool_namespace !== "agents") {
        problems.push(
          `${CONFIG_PATH}: features.multi_agent_v2.tool_namespace must be "agents"; the default namespace rejects the enriched schema on Codex 0.144.x.`,
        );
      }
    }
  }

  const doctrine = GUIDE_FILES.map((file) => path.join(repoRoot, file))
    .filter(existsSync)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  const expected = new Set(expectedAgentNames);
  const used = new Set<string>();
  const calls = doctrine.matchAll(/spawn_agent\s*\(([\s\S]*?)\)/g);
  let callCount = 0;

  for (const match of calls) {
    callCount += 1;
    const call = match[1];
    const taskName = /task_name="([^"]+)"/.exec(call)?.[1];
    const agentType = /agent_type="([^"]+)"/.exec(call)?.[1];
    const forkTurns = /fork_turns="([^"]+)"/.exec(call)?.[1];

    if (!taskName) problems.push(`Typed delegation is missing task_name: spawn_agent(${call})`);
    if (!agentType) {
      problems.push(`Delegation uses task_name without agent_type (task_name never selects a role): spawn_agent(${call})`);
    } else {
      used.add(agentType);
      if (!expected.has(agentType)) {
        problems.push(`Delegation uses unknown agent_type "${agentType}"; no exact .codex/agents/${agentType}.toml exists.`);
      }
      if (taskName === agentType) {
        problems.push(`Delegation uses task_name="${taskName}" as the role name; task_name must identify the execution, while agent_type selects the role.`);
      }
    }

    if (forkTurns !== "none") {
      problems.push(
        forkTurns === "all"
          ? `Typed delegation contains forbidden fork_turns="all": spawn_agent(${call})`
          : `Typed delegation must use fork_turns="none" unless a documented limited numeric fork is required: spawn_agent(${call})`,
      );
    }
  }

  if (callCount === 0) problems.push(`${GUIDE_FILES.join(" / ")} contain no typed spawn_agent examples.`);

  for (const name of [...expected].sort()) {
    if (!used.has(name)) {
      problems.push(`.codex/agents/${name}.toml exists but no operator guide demonstrates agent_type="${name}".`);
    }
  }

  return problems;
}
