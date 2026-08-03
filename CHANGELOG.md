# Changelog

All notable changes to the shared species-schema package are documented here. Written for humans: what
changed for whoever depends on this package, not a commit dump.

> **This is the first changelog for this repo** — it did not keep one before. History is not backfilled;
> it starts with the changes below.

## Unreleased

## 0.18.0

### Added

- **Species free text is now bilingual.** Every curator-authored field — common names, care notes, soil/light
  descriptions, and all narrative fields — now requires entries in both English and Spanish (Mexican), supplied
  as `{ en: string, es: string }` objects. The contract remains backward-compatible with legacy English-only
  records via a tolerant reader, so existing species already curated continue parsing unchanged; **new curations
  and edits must supply both languages**.
- **The structured repotting-sign catalogue replaces unstructured prose.** `repotting.signs` — a freeform,
  English-only array — has been removed entirely from the species-record contract. A species' repotting signs
  are now authored as rows in a bilingual, per-species catalogue (stable ids like
  `universal--water-runs-through`, both locales, an ordinal evidence class the care engine can weight) —
  visible to agents and owners as discrete, translated signals instead of invisible English text. A record
  still carrying the old `signs` key parses fine (the schema strips unknown keys); no data migration is needed.
- **Several plant-measurement fields now document their own meaning and units in the schema.** The pot's
  diameter (`potSizeCm`), a progress entry's recorded height (`sizeCm`), a plant's age (`ageMonths`), and a
  manually-set task cadence (`intervalDays`) each carry a Zod description explaining exactly what the field
  means, its units, and — where it matters — what it is NOT (e.g. `potSizeCm` is the rim diameter, never the
  radius or the height; `sizeCm` is the ONLY height the care engine reads, so a height recorded only in prose
  is invisible to scheduling). Written so the care engine, the agents, and anyone reading the data model
  understand the intent without guessing or reaching for external docs.
- **The `care.done` operation now has a REPOT variant with its own required fields.** When `task` is
  `'REPOT'`, `operationSchema` now REQUIRES `potSizeCm`, `soilMix`, and `charged` on the same operation — and
  FORBIDS all three (plus `refreshedOn`) on every other task — enforced by a `superRefine` rather than a
  nested discriminated-union member, since `care.done` stays one flat schema. A `care.done` proposal for a
  REPOT task with any of the three fields missing, or a non-REPOT `care.done` carrying any of them, is now
  rejected at validation time instead of reaching the write core.

## 0.15.0

### Added

- **Two new juvenile-care fields on the species record: `juvenilePeriodMonths` and
  `juvenileRepotIntervalMonths`.** Both are optional, independently-researched horticultural figures — how
  long a specimen counts as young, and how often a young specimen is potted on while it does — rather than
  a multiplier derived from the adult repotting interval. Every already-curated record predates them and
  keeps parsing unchanged; when a species has no researched value for either, it stays `null` and consuming
  apps fall back to today's adult-only behavior.

## 0.14.0

### Added

- **A new soil mix: `all-purpose-perlite`.** All-purpose potting mix amended with perlite now has its own
  slug in the shared vocabulary, so the care engine can schedule it as the faster-draining medium it is.
- **The substrate now has two modelled properties.** `SUBSTRATE_CHARGE_DAYS` says how many days of food a
  freshly-filled pot of each mix carries; `SUBSTRATE_LIFE_DAYS` says how long that mix's physical structure
  keeps working before it is worth refreshing. They are deliberately independent: orchid bark holds almost
  no food and still lasts three years.
- **A new proposal operation, `substrate.refresh`** — brings the union to **nineteen operations in total**.
  The Plant Doctor and the Gardener can now propose recording that a plant's medium was renewed on a given
  day — something they could learn in conversation but had no way to write down. As always it is a proposal
  the owner approves, never a direct write. Granted to both agent roles from the start; the doctor's grant
  withholds `plantId` (its token is already pinned to one plant), the gardener's supplies it (its token is
  anchored to the owner).
- **`IDEMPOTENCY_KEY_HEADER` — the shared idempotency header name.** A new Zod-free constant (`'Idempotency-Key'`)
  single-sourced here so the API's dedup interceptor and the web (BFF proxy + client) all read the one header
  name and can never drift, the same single-source discipline as `IMAGE_MAX_EDGE`.
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
- **Two new proposal operations for the Plant Lifecycle module, `plant.memorialize` and `plant.gift`** —
  bring the union to **eighteen operations in total**. They let the Plant Doctor or the Gardener ask to move
  a plant to the pantheon (a permanent memorial) or mark it as gifted (reversible by the owner), exactly like
  the owner's own equivalent buttons. Neither operation takes any fields of its own — the target plant is the
  token's own pin (doctor) or the operation's own `plantId` (gardener), the same convention `note.create`
  already established. Both operations are granted to **both** agent roles from the start: neither
  transition is a role-specific privilege. There is deliberately **no** `plant.revive` operation in the
  union — reviving a plant back from gifted is owner-only, enforced by leaving it out of the union entirely
  rather than by a capability-map row that could later be misconfigured.
