# Changelog

All notable changes to the shared species-schema package are documented here. Written for humans: what
changed for whoever depends on this package, not a commit dump.

> **This is the first changelog for this repo** — it did not keep one before. History is not backfilled;
> it starts with the changes below.

## Unreleased

### Added

- **The Plant Doctor proposal-operations contract now lives here.** The discriminated union of the fifteen
  proposal operations (`operationSchema` / `createProposalSchema`) plus its pure helpers
  (`findOverlappingWriteSet`, `serializedBytes`) moved into this package as framework-agnostic Zod, so the
  API and the Plant Doctor validate proposals against **one** definition instead of a hand-maintained copy.
- **Care-operations vocabularies** — `FREQUENCY_BEARING_TASKS`, `PROGRESS_HEALTH_VALUES`, and `MAX_SIZE_CM`
  are now exported here as the single shared source consumers derive from (kept in lock-step with the API's
  Prisma enums and DTO by a parity test).
- **A reusable tool-documentation renderer** at the `./tool-doc` subpath. It turns any Zod schema into a
  Markdown reference — field tables with each field's full value vocabulary, one schema-validated JSON
  example per tool, one-level sub-tables that expose nested-section vocabularies, and a `.refine()`
  "tripwire" that fails the build if a cross-field invariant is added without documenting it — behind a
  marker-protected write/check harness. The embedded agent repos use it to generate their `AGENT-TOOLS.md`.
- **A per-agent-role capability map**, at the new `./agent-capabilities` subpath. For each agent role
  (`doctor`, `gardener`) and each of the fifteen proposal operations, it states whether that role may
  propose the operation at all and, for an operation it may propose, which of its fields it may **not**
  set — concretely, a `doctor`-scoped `plant.update` may no longer carry `placeId`. Consumers call
  `mayPropose()` and `forbiddenFieldsIn()` instead of hand-rolling the same allow/deny logic per agent
  repo, and a bundled check (`assertOmitFieldsAreRealFields`) fails the build if a withheld field name
  doesn't actually exist on its operation's schema.
- **The shared agent-side scaffolding**, at new `./agent-kit/*` subpaths (`workspace`, `api`, `db`,
  `codex-parity`, `codex-parity/repo-checks`, `guide-pair`) plus two published CLI bins
  (`agent-kit-codex-agents`, `agent-kit-codex-spawn-schema`). This is the session-workspace resolver, the
  Bearer-token API client, the read-only DB helper, the Claude↔Codex subagent-parity generator/checker, and
  the `CLAUDE.md`/`AGENTS.md` guide-pair linter that the Plant Doctor and the Knowledge Engine each used to
  carry as their own copy — now one implementation, imported rather than forked. Its DB and Codex-tooling
  dependencies (`mysql2`, `execa`, `yaml`, `smol-toml`) are declared as **optional peer dependencies**: a
  plain `npm install` of this package (as `my-plants-api` and `my-plants-web` do) pulls in none of them; an
  agent repo that already depends on them directly is unaffected.
- **Two new proposal operations for clinical records.** `clinical_record.create` and `clinical_record.update`
  join the union (now ten operations in total), covering a doctor-authored, day-scoped Markdown case note
  capped at 20,000 characters. Both are classified **doctor-only** in the capability map, and a proposal that
  carries two clinical-record operations together is rejected outright — a plant has at most one such record
  per calendar day, so two in one proposal can only be redundant or contradictory.
- **Five new garden operations, for the Gardener** — `place.create`, `place.update`, `city.create`,
  `city.update` and `plant.create` — bring the union to **fifteen operations in total**. They let the
  Gardener (via approved proposals, exactly like the doctor) add and adjust a place or a city and register a
  new plant. Every plant-scoped operation also gained an optional per-operation `plantId`: the capability map
  **withholds** it from the doctor (whose token is already pinned to one plant) and **supplies** it to the
  gardener (whose token is anchored to the owner, so it must name which plant an operation targets).
  Relocating a plant — `plant.update` with `placeId` set — is the gardener's exclusive grant; the doctor
  remains refused that field. The capability map now covers both roles across all fifteen operations, and the
  gardener is refused `progress.delete` and both `clinical_record.*` operations.
- **A shared image size ceiling, `IMAGE_MAX_EDGE`.** The single, versioned upper bound (1600 px) on the long
  edge of any photo the app compresses before upload and the API resizes on the way in, so the two are
  guaranteed to agree on the maximum photo size — raising the ceiling later is one change instead of two.
- **A new proposal operation, `note.create`**, plus its shared bound `NOTE_MAX_LEN` (2000 characters) — bring
  the union to **sixteen operations in total**. It lets the Plant Doctor or the Gardener leave a free-text
  note on a plant, exactly like the owner's own "Agregar nota." Unlike the doctor-only clinical-record pair,
  `note.create` is granted to **both** agent roles from the start in the capability map: writing a note isn't
  a role-specific privilege the way a diagnosis or a relocation is. The doctor's grant withholds the
  operation's `plantId` (its token is already pinned to one plant); the gardener's supplies it (its token is
  anchored to the owner, so it must name the plant the note belongs to).
