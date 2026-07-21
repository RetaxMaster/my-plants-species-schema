import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * ⚠️ The FILE this module reads and writes is a RUNTIME CONTRACT WITH THE API, not an internal detail:
 * the API's CodexRoleVerificationService reads `<stateDir>/codex-roles-verified.json` with the exact
 * shape `{ "codexRolesVerified": boolean }`, per engine, on every request, and fails CLOSED. Changing
 * the path or the shape here silently disables Codex in production. This module now lives once, in the
 * shared agent kit — there is no sibling copy to keep in step.
 */
const RECORD_FILENAME = "codex-roles-verified.json";

function recordPath(stateDir: string): string {
  return path.join(stateDir, RECORD_FILENAME);
}

export function readCodexRolesVerified(stateDir: string): boolean {
  try {
    const raw = readFileSync(recordPath(stateDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>).codexRolesVerified === true
    );
  } catch {
    return false; // default-deny on absent / unreadable / malformed
  }
}

export function writeCodexRolesVerified(stateDir: string, verified: boolean): void {
  const target = recordPath(stateDir);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify({ codexRolesVerified: verified })}\n`);
  renameSync(tmp, target); // atomic swap
}
