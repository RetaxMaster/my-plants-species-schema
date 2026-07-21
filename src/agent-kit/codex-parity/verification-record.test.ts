import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readCodexRolesVerified, writeCodexRolesVerified } from "./verification-record";

// CANONICAL on-disk contract — MUST match the API reader (Spec 3 / api-platform plan Task 9,
// CodexRoleVerificationService): file `<stateDir>/codex-roles-verified.json`, shape `{ codexRolesVerified:
// boolean }`, keyed PER-ENGINE by which state dir (PLANT_DOCTOR_STATE_DIR vs the KE state dir) — NOT by a
// name embedded in the filename. Both sides read/write this exact path + field or the gate silently denies.
describe("codex roles verification record", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "verif-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("DEFAULT-DENIES: absent record reads false", () => {
    expect(readCodexRolesVerified(dir)).toBe(false);
  });

  it("DEFAULT-DENIES: an unreadable/garbage record reads false", () => {
    writeFileSync(path.join(dir, "codex-roles-verified.json"), "not json {{{");
    expect(readCodexRolesVerified(dir)).toBe(false);
  });

  it("DEFAULT-DENIES: a non-boolean codexRolesVerified field reads false", () => {
    writeFileSync(path.join(dir, "codex-roles-verified.json"), JSON.stringify({ codexRolesVerified: "true" }));
    expect(readCodexRolesVerified(dir)).toBe(false);
  });

  it("writes the CANONICAL file name + field the API reader expects", () => {
    writeCodexRolesVerified(dir, true);
    const raw = JSON.parse(readFileSync(path.join(dir, "codex-roles-verified.json"), "utf8"));
    expect(raw).toEqual({ codexRolesVerified: true });
  });

  it("round-trips a true, and is read DYNAMICALLY (no caching): a later write is observed", () => {
    writeCodexRolesVerified(dir, true);
    expect(readCodexRolesVerified(dir)).toBe(true);
    writeCodexRolesVerified(dir, false);
    expect(readCodexRolesVerified(dir)).toBe(false); // no stale cache
  });

  it("keys by state dir — a record in one engine's state dir does not authorize another engine's", () => {
    const other = mkdtempSync(path.join(tmpdir(), "verif-other-"));
    try {
      writeCodexRolesVerified(dir, true);
      expect(readCodexRolesVerified(other)).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});
