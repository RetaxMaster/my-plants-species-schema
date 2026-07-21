#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { execa } from "execa";

import { agentRepoRoot } from "./repo-root.js";
import { writeCodexRolesVerified } from "../codex-parity/verification-record.js";

/**
 * BILLABLE live probe — NEVER part of `npm test` (which never invokes a billing CLI).
 *
 * Two uses (spec §6): the ONE-TIME §5 spike confirmation, and the per-deploy re-verification that
 * (re)writes the per-engine verification record (Spec 3 §7) so the record always reflects the
 * currently-deployed launch. Certifies BOTH that `multi_agent_v2` is on (spawn_agent exposes the enriched
 * schema) AND that THIS repo's concrete `.codex/agents/*.toml` roles actually loaded — a launch with the
 * feature on but the roles absent is the FLAT pipeline the record must catch.
 *
 * Spike outcome Path A (recorded in the parity plan): `codex exec -C` and `codex app-server` (the runtime's
 * launch) load `.codex/` identically for a trusted checkout, so this `exec -C` probe is a valid app-server
 * certifier.
 */

const REPO_ROOT = agentRepoRoot();

const REQUIRED_PARAMETERS = ["task_name", "message", "agent_type", "fork_turns"];
const PROMPT =
  "Do not read files or call any tools. Inspect ONLY the tool schema supplied to this turn. " +
  "Return exactly one JSON object with two keys: " +
  '"parameters" = an array of the exact parameter names exposed by the spawn_agent tool, and ' +
  '"agent_types" = an array of the exact accepted agent_type enum values. No prose, only the JSON object.';

// The deploy sets CODEX_ROLES_STATE_DIR to THIS engine's OWN state dir before running the probe (doctor →
// PLANT_DOCTOR_STATE_DIR, KE → the KE state dir). The state dir is the per-engine key of the canonical
// record contract — the probe writes ONLY that engine's `codex-roles-verified.json`. When unset (interactive
// sanity check) the write is skipped.
const STATE_DIR = process.env.CODEX_ROLES_STATE_DIR;
function record(verified: boolean): void {
  if (STATE_DIR) writeCodexRolesVerified(STATE_DIR, verified);
}

function fail(message: string): never {
  record(false); // fail CLOSED before exiting — never leave a stale `true`
  throw new Error(message);
}

async function main(): Promise<void> {
  // Fail CLOSED for the whole probe: the record is set `true` ONLY at the very end, on a full pass. Writing
  // `false` up front means ANY early error below (missing codex binary, unreadable agents dir, execa timeout)
  // leaves a `false` record instead of a stale `true` that would authorize a flat pipeline (Spec 2 §5).
  record(false);

  const codexBin = process.env.CODEX_BIN ?? "codex";
  const version = (await execa(codexBin, ["--version"])).stdout.trim();

  // Expected roles come from the SOURCE OF TRUTH (.claude/agents/*.md), NEVER the generated .codex/agents: an
  // empty or half-generated .codex dir would make the roles check pass VACUOUSLY (missingRoles = []) and
  // certify a FLAT pipeline — exactly what the gate must prevent (Spec 2 §5/§6).
  const expectedRoles = readdirSync(join(REPO_ROOT, ".claude/agents"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -".md".length))
    .sort();
  if (expectedRoles.length === 0) {
    fail(`No .claude/agents/*.md roles found in ${REPO_ROOT} — refusing to certify (an empty role set would authorize a flat pipeline).`);
  }
  // The generated .codex/agents set MUST match the source exactly. The drift gate proves this in `npm test`,
  // but a freshly-pulled deploy checkout could be un-generated — verify it here before trusting the launch.
  const generatedRoles = readdirSync(join(REPO_ROOT, ".codex/agents"))
    .filter((f) => f.endsWith(".toml"))
    .map((f) => f.slice(0, -".toml".length))
    .sort();
  const drift = [
    ...expectedRoles.filter((r) => !generatedRoles.includes(r)),
    ...generatedRoles.filter((r) => !expectedRoles.includes(r)),
  ];
  if (drift.length > 0) {
    fail(`.codex/agents drift vs .claude/agents (${drift.join(", ")}). Run agents:generate — refusing to certify.`);
  }

  const run = await execa(
    codexBin,
    ["--ask-for-approval", "never", "exec", "-C", REPO_ROOT, "--sandbox", "read-only", "--json", PROMPT],
    { reject: false, stdin: "ignore", timeout: 180_000 },
  );

  const messages = run.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      } catch {
        return null;
      }
    })
    .filter((event): event is { type?: string; item?: { type?: string; text?: string } } => event !== null)
    .filter((event) => event.type === "item.completed" && event.item?.type === "agent_message")
    .map((event) => event.item?.text)
    .filter((text): text is string => typeof text === "string");

  const schema = messages
    .map((message) => {
      try {
        return JSON.parse(message) as Record<string, unknown>;
      } catch {
        // The model may wrap the JSON in a fenced block; strip a leading ```json / ``` fence.
        const stripped = message.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        try {
          return JSON.parse(stripped) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    })
    .find((value): value is Record<string, unknown> => value !== null && "parameters" in value);

  if (run.exitCode !== 0 || !schema) {
    fail(
      `Codex schema probe failed (${version}, exit ${run.exitCode}). Ensure ${REPO_ROOT} is trusted in ~/.codex/config.toml so its .codex/config.toml is loaded.\n${run.stderr}\n${run.stdout}`,
    );
  }

  const parameters = Array.isArray(schema.parameters) ? schema.parameters.map(String) : [];
  const agentTypes = Array.isArray(schema.agent_types) ? schema.agent_types.map(String) : [];

  const missingParams = REQUIRED_PARAMETERS.filter((name) => !parameters.includes(name));
  if (missingParams.length > 0) {
    fail(`spawn_agent schema is missing: ${missingParams.join(", ")}. Visible: ${parameters.sort().join(", ")}`);
  }

  // Step 2b: prove the repo's CONCRETE roles loaded — not just that multi_agent_v2 is on.
  const missingRoles = expectedRoles.filter((role) => !agentTypes.includes(role));
  if (missingRoles.length > 0) {
    fail(
      `app-server did not load roles: ${missingRoles.join(", ")}. Visible agent_types: ${agentTypes
        .sort()
        .join(", ")}. Launch is FLAT — refusing to certify.`,
    );
  }

  record(true);
  console.log(
    `${version}: spawn_agent parameters = ${parameters.sort().join(", ")}; all ${expectedRoles.length} roles loaded (${expectedRoles.join(", ")}).`,
  );
}

main().catch((error) => {
  record(false); // belt-and-braces: never leave a stale `true` if main() threw before its own fail()
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
