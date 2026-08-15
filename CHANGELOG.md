# Changelog

All notable changes to the shared species-schema package are documented here. Written for humans: what
changed for whoever depends on this package, not a commit dump.

> **This is the first changelog for this repo** — it did not keep one before. History is not backfilled;
> it starts with the changes below.

## Unreleased

### Fixed

- **A kept substrate anchor no longer counts as a full success.** `deriveProposalOutcomeStatus` used to
  look only at whether an operation's care-event write was a same-day duplicate. A REPOT completion (or a
  standalone substrate refresh) whose day was older than the stored anchor still reports `status: 'applied'`
  even though nothing about the anchor moved — no column changed, no reading was retracted, no audit row was
  written for that half of the write — and the old derivation counted that operation as a plain success, so
  a proposal made of nothing but kept anchors derived `ALL_APPLIED`. The derivation now also treats an
  operation carrying `substrate.status === 'kept'` as not fully applied, through one exported predicate
  (`isProposalOperationNotFullyApplied`) so a future consumer shares the same answer instead of re-deriving
  it. The three existing `ProposalOutcomeStatus` values are unchanged; only which operations count toward
  them changed.

### Added

- **A care outcome can now say that the pot details a repot carried were discarded.** A repot completion
  submits the new pot's diameter and soil mix. When the day it names is older than the stored substrate
  anchor the profile write is skipped, and when that submission is *also* a second record for a day that
  already had one, no care event is written either — so the values have nowhere at all to live. The
  `already-recorded-on-day` arm gained an optional `potDetailsDiscarded`, attached through a new
  `withPotDetailsDiscarded()` seam that mirrors `withSubstrateAnchor()`: passing `false` writes no key, so
  an absent flag can never be read as an assertion. It is deliberately not derivable from the outcome's
  other members — an owner may answer "I don't know" to both fields, and only the writer knows whether
  anything was supplied.

- **`SubstrateAnchorOutcome` — "what the substrate clock actually did" — now lives here, once, beside
  `CareWriteResult`.** A repot completion answers two independent questions: whether the care event was
  recorded, and whether the pot's "last filled on" clock actually moved. The second one existed already,
  but only as a type hand-declared in the API and hand-mirrored in the web, because adding it here would
  have repacked a tarball five repos pin while other work was in flight. That scheduling reason is gone,
  and with it the two copies.
- **A care outcome can now CARRY its substrate answer, so an approved agent proposal stops losing it.**
  `careWriteOutcomeSchema` gained an optional `substrate` on both arms, and `withSubstrateAnchor()` is the
  one seam that attaches it. This closes a real silence rather than a stylistic one: the stored
  per-operation outcome array on an applied proposal is validated by this schema on the way back out, and
  a schema that does not declare a key STRIPS it — so a repot whose clock refused to move round-tripped as
  an ordinary success for both the approving owner and the agent. Absence still means "this write said
  nothing about the anchor" and must never be read as "the anchor was refreshed": passing nothing writes
  no key at all, so an older stored proposal replays exactly as it did before.

- **`verdictIsAnswer(verdict)` — "did this reading decide anything?" — now lives here, once, beside
  `READING_VERDICTS`.** It answers the question three different seams need: which of a day's readings
  speaks for that day, whether an edit that decides nothing may overwrite an answer already stored, and
  whether the edit dialog is about to replace a reading worth restating. Until now the API and the web each
  carried their own copy of it, both correct and both tested — which is exactly the situation where a
  future change to the verdict vocabulary quietly updates one of them. It is derived from the single
  verdict that means "nothing decided" (`NONE`) rather than from a list of the decisive ones, so a fourth
  verdict added later counts as an answer by default: a new answer that went unnoticed would be silent,
  while a new non-answer mistakenly treated as one shows up the first time it is used.

- **A calibration anchor is now held to the instrument's own scale, not just to the other anchor.**
  `instrumentCalibrationSchema` is instrument-agnostic — it never sees an instrument id — so
  `saturatedValue > dryValue` was the only rule it could enforce, and `{ saturatedValue: 2000, dryValue:
  -500 }` passed. New `instrumentCalibrationSchemaFor(instrumentId)` wraps it and bounds each anchor by the
  same scale a reading is bounded by. The agnostic schema is unchanged and still exported: consumers that
  genuinely cannot name an instrument keep working, they simply get the weaker of the two guarantees.
- **`offScaleReason(instrumentId, value)`**, extracted out of `rawValueRangeRefinement`, is now the single
  implementation of "is this a value this instrument can produce?" — bounds and, on a closed scale,
  granularity. It returns the reason as a string rather than a boolean, which is what lets one
  implementation serve three different Zod paths (`rawValue`, `saturatedValue`, `dryValue`) instead of the
  three copies that let the anchors drift out of the rule in the first place. `rawValueRangeRefinement`'s
  own behaviour and message are unchanged; it now calls this.
- **Two new, hardware-free instruments: `wooden-stick` and `finger`.** Both report one of three named
  states (`rawMin: 1, rawMax: 3`) rather than a physical number, so a new `captureKind` property
  (`'numeric' | 'ordinal'`) says how a reading is actually supplied: `numeric` for the existing probe and
  scale, `ordinal` for these two — a consumer renders a choice control instead of a number field, but the
  wire format is unchanged (the chosen level still travels as `rawValue`, bounded like any other reading).
  They are two separate rows, not one shared row, because they reach different depths of the same pot (a
  stick to the bottom, a finger about 3 cm in) and therefore read different zones of it. Neither needs a
  calibration — a named state is not a raw physical quantity an anchor could rescale.
- **`resolutionStates(row)`**, derived from an instrument row's own `rawMin`/`rawMax`/`rawStep` — how many
  distinguishable states that instrument can report, `null` for an open-ended scale (the kitchen scale's
  grams). Lets a consumer (the ordinal capture control, the API's confidence engine) ask "how coarse is
  this instrument" without hand-typing a number that could silently disagree with the row it describes.
  Throws, rather than returning a bogus count, when a row's own scale is malformed (`rawStep <= 0`, or a
  closed `rawMax` below `rawMin`).
- **`rawValueRangeRefinement`**, the raw-value-in-scale bound extracted out of `soilReadingCreateSchema`'s
  own `superRefine` so a sibling schema (the API's read-only watering-verdict preview) can enforce the
  identical bound without pasting it a second time. Additive: `soilReadingCreateSchema`'s own behaviour is
  unchanged, it now simply calls the extracted function. **It now also enforces `rawStep`**, so a value the
  instrument could not have produced (`5.5` on the probe's integer 1..10 index) is refused rather than
  stored as a measurement. Granularity is checked ONLY where the scale is closed (`rawMax !== null`): the
  kitchen scale declares `rawStep: 1` too, but its ceiling is open because grams are continuous, and a real
  scale legitimately reads `1234.5 g`. When a value breaks both bounds and step, only the bounds issue is
  raised — it is the one the caller can act on.
- **`protocolKind` gained a third value, `'shallow-insertion'`.** Previously `'insertion' | 'whole-pot-mass'`.
  It describes an instrument that IS pushed into the medium but to a depth the instrument itself fixes,
  rather than one computed from the pot — a finger reaches the top few centimetres whatever the pot's
  diameter says. **`finger` moved from `'insertion'` to `'shallow-insertion'`**, which is a behaviour change
  for any consumer that prints a pot-derived depth: it must no longer do so for that row. This is the same
  defect `protocolKind` was introduced to fix (a kitchen scale being shown an insertion depth) recurring one
  instrument later, and it matters beyond wording — the API's `FINGER_DEPTH_PENALTY` assumes a finger reads
  the top layer, so instructing an owner to insert one 6 cm deep contradicted the engine's own reasoning.

- **`Recommendation` / `HoldBasis` / `UnavailableReason`-shaped unions promoted to the shared contract**, at
  a new `watering-verdict-constants.ts` (Zod-free, same pattern as `soil-instrument-constants.ts`) and
  re-exported from `index.ts` and its own package subpath. These were closed literal unions the API's
  watering-verdict engine computes and the web only reads; deriving both sides' types from one array — the
  same fix `photo-contract-constants.ts` already made for the photo pipeline's status machine — means the
  two can never silently diverge on a renamed or added value.

- **`implausibleForPotReason(rawValue, calibration)` + `READING_PLAUSIBLE_SPANS_BELOW_DRY` /
  `READING_PLAUSIBLE_SPANS_ABOVE_SATURATED` (0.30.2).** The sibling of `offScaleReason`, and deliberately a
  separate function rather than a widening of it: that one asks *"can this INSTRUMENT produce this value?"*
  and needs only the contract row, so it can live inside a Zod refinement at the HTTP edge; this one asks
  *"can THIS POT weigh this?"* and needs the per-(plant, instrument) calibration, which only the API holds.
  It exists because `kitchen-scale.rawMax` is `null` by contract — grams genuinely are open-ended — so the
  one instrument that has a per-pot calibration had no ceiling at all: `99999999 g` was accepted, clamped to
  a perfectly legal 100 % wetness, and rescheduled the plant. A calibrated pot's two anchors are the only
  per-pot mass scale that exists, so the band is expressed in **spans** (`saturated − dry`) and never in
  grams: one span below the dry anchor, two above the saturated one, inclusive. The asymmetry is physical —
  a pot gains mass in honest ways with no natural ceiling (a deep watering, runoff in the saucer, a plant
  that grew), and loses it only down to solids that do not evaporate. `null`/`undefined` calibration returns
  `null`: with no anchors there is no ruler, and an uncalibrated reading must stay recordable. The two
  constants are **tuned** and carry their own `docs/care-engine.md` §7.10 ledger row (§7.20.18 is the
  argument). ⚠️ It deliberately does **not** touch `instrumentCalibrationSchemaFor`'s open ceiling on the
  ANCHORS: at calibration time there are no prior anchors to judge against, and inventing one there would be
  exactly the underived constant §7 forbids.

- **The shared one-per-day care-write outcome type (0.31.0).** A discriminated contract distinguishing
  whether a care-task submission was *applied* (the task was completed and recorded in the system) from
  *already-recorded-on-that-day* (this task was already done on the calendar day the submission named, so the
  system can advise the agent to choose a different action). Until now the API, the web, and the agent
  mediator each carried their own definition of this result — which is exactly the situation where contract
  ambiguity stays undetected because different implementations that agree all stay green. Consumers now import
  `careWriteOutcomeSchema` and its `CareWriteOutcome` type here once, never re-derive the distinction. It is
  **day-scoped, not today-scoped**: the outcome describes the day the submission itself named, so asking
  "was WATER already completed on 2026-08-12?" can have a different answer than today, and the proposal
  mediator must answer both questions correctly and independently.

### Changed

- **⚠️ Breaking: `soilReadingCreateSchema` no longer carries `wateringRelation`.** The field was added in
  0.25.0 so a reading taken on a day the plant was *also* watered could say which side of that watering it
  fell on, rather than being thrown away. It turns out only half of that ambiguity is real. A reading dated
  the plant's own **today** is answerable from the ordering already on file — a watering recorded for today
  was recorded *before* the write that is happening now — so the API derives the answer instead of asking
  for it, and this schema, which every surface shares, must not carry a field no caller should ever supply.
  A **back-dated** reading on a watering day stays genuinely unknowable (care events store a date and no
  time, so nothing recovers the order) and is still asked about — but through the API's own request DTO,
  which extends this schema, not through the shared contract itself.
  **`WATERING_RELATIONS`, `WateringRelation` and `wateringRelationEnum` are unchanged and still exported**:
  the vocabulary, the read type and the stored column all stay exactly as they were, so nothing already
  recorded is reinterpreted. What changed is only which schema accepts the field on the way in. A consumer
  that still sends it on a create body will have it silently stripped by Zod, which is precisely why the
  API stopped validating that route with the bare shared schema.
- **`wateringRelation`'s documented meaning is corrected.** Its doc comment claimed the value designates the
  admitted reading as a saturated anchor and forces its wetness to ≈ 1. It does no such thing and never did:
  it is an **admission filter** and nothing more — on the fenced watering day a row is kept when the value
  says `AFTER` and dropped otherwise (`BEFORE` is the previous cycle's tail, `NULL` is unknown and is never
  guessed), and an admitted row is then fitted at exactly the wetness it measured. No behaviour changed; the
  description of it was wrong, and a consumer reading it could have built on a guarantee that was not there.

## 0.26.0

### Added

- **`InstrumentRow.protocolKind` (`'insertion' | 'whole-pot-mass'`).** Says HOW a reading with that
  instrument is physically taken, so a consumer never has to branch on the instrument id to decide which
  measuring protocol to show. The galvanic probe is `insertion` (a depth and a distance from the pot's
  centre are meaningful); the kitchen scale is `whole-pot-mass` (neither is). This exists because the web
  was printing the insertion protocol — "insert to about 8 cm deep" — for a kitchen scale.

### Changed

- **`soilReadingCreateSchema` now range-checks `rawValue` against the instrument's own declared scale.** It
  previously accepted any finite number, so `99` and `-50` were valid readings on a 1–10 probe and were
  silently clamped into a legal `[0,1]` wetness downstream — a fabricated anchor inside a legal range. The
  bounds are read from the instrument row, so adding a row extends the check with no edit here, and
  `rawMax: null` stays genuinely open-ended (only the `rawMin` floor binds for the kitchen scale).
  **Consumers that were relying on out-of-scale values being accepted will now see a validation error**
  naming the field, the instrument and its real bounds.

## 0.25.0

### Added

- **`wateringRelation` on a soil reading, and the `WATERING_RELATIONS` vocabulary that backs it.** A reading
  taken on a day the plant was also watered used to be silently excluded from the drying-rate fit — it is
  ambiguous about which drying cycle it belongs to. The owner ruled that ambiguity should be resolved by
  asking, never by assuming: `soilReadingCreateSchema` now accepts an optional `wateringRelation: 'BEFORE'
  | 'AFTER'` field answering "was this taken before or after that day's watering?" — meaningful only on a
  watering day, and absent means UNKNOWN, never "before".

## 0.24.0

### Added

- **The soil-instrument property table.** Two instruments are modelled now — a galvanic probe (a 1–10
  index, comparable only to itself) and a kitchen scale (open-ended grams) — each as one row declaring its
  unit, its raw scale, which direction on that scale means "wetter", whether its readings can be compared
  across pots, and whether it needs a per-pot calibration before it means anything. Consumers never special-
  case a device: the row says what the instrument is, and the engine only ever sees the normalised result
  below. It ships Zod-free at the new `./soil-instrument-constants` subpath, so the web can read it without
  pulling Zod into its bundle.
- **The soil reading and per-pot calibration contract.** A reading (`soilReadingCreateSchema`) records which
  instrument was used, the raw value it showed, the day it was taken, and — the point of measuring at all —
  what the owner decided from it: nothing, postpone watering, or water now, with the postponement date
  required exactly when the verdict is `POSTPONE` and forbidden otherwise. A raw value only means something
  once it is placed against this pot's own wet and dry anchors, so the kitchen scale's calibration
  (`instrumentCalibrationSchema`) carries a saturated value and a dry value, and rejects a calibration where
  the "wet" anchor is not actually wetter than the "dry" one.
- **Two new WATER feedback reasons for a verdict backed by an actual reading:** `dry-soil-measured` (an
  early watering justified by measurement) and `soil-still-moist-measured` (a postponement justified by
  measurement). Both are recorded on the plant's history exactly like their un-measured counterparts, but
  are deliberately kept out of the watering learning loop — the justified-reason constants still point only
  at the plain `dry-soil`/`soil-still-moist` slugs, so a measured verdict is never double-counted against
  the drying-rate signal the measurement already feeds into the engine through its own channel.
- **A shared, context-free `isNotAfterYmd(value, reference)` calendar comparison**, for enforcing that a
  past-event date (a repot, a substrate refresh) was not recorded in the future. It stays deliberately
  separate from the base date validator, since other fields — a postponement's target date, a planned
  move — are future-by-design and must keep accepting them.

## 0.22.0

### Added

- **The Plant Doctor and the Gardener can now propose postponing a care task.** Both agents could already
  propose marking a task done; postponing — the other half of the same button the owner has in the app —
  was simply never modelled, so an agent that concluded "hold off on watering this one for a week" had no
  way to say it. The new `care.postpone` operation carries the task, the day it is being recorded, and the
  day the task moves to, and it lands in exactly the same write path the owner's own Postpone uses, so it
  teaches the care engine the same way an owner's postponement does. As with every other operation that
  targets one plant, the doctor may not name a plant (its session is already pinned to one) and the
  whole-garden gardener must.
- Two guards a postponement needs and the owner's own form has always given it implicitly: the new date is
  required, and it must fall strictly after the day being recorded — a "postponement" into the past would
  make the task more overdue, not less.
- **Repotting is postponable too, but by a reason rather than a date**, because that is how the app itself
  works. A repot is not a scheduled chore here but an inspection, so putting one off means saying *why* —
  not needed yet, needed but not possible right now, or could not check — and the app works out how long
  to wait from that. Giving a repot postponement a date is refused outright rather than accepted and
  ignored, which is what would otherwise happen: the agent would believe it had moved the repot to a day
  the app never uses. The two vocabularies are exclusive in both directions, so neither can be sent where
  it means nothing.
- One thing an agent still cannot do, deliberately: if a plant has an unanswered repot questionnaire
  waiting in the app, only the owner can resolve it, and an agent's postponement is refused with the same
  message the owner's own app would show. Agents were given control over what already exists, not a new
  way around it.

## 0.21.0

### Fixed

- **The generated agent tool docs no longer tell the gardener that a mandatory field is optional.** Every
  operation the gardener proposes against one of the owner's plants has to name that plant, and the API
  refuses it twice over if it does not. The tool reference the gardener actually reads said the opposite —
  it marked `plantId` "optional" on all eleven of those operations — because the shared doc renderer worked
  out required-ness from the data contract alone, and the contract has to leave that field optional so the
  Plant Doctor, which is already pinned to one plant, can leave it out entirely. The result was an agent
  following its own reference into a request that could never succeed, then having to work out why from the
  error. Required-ness in a generated reference is now a statement about *the agent reading it*, not about
  the shared contract: the capability map records which fields each role must supply, the renderer honours
  it, and a linter fails the build if the map, the generated reference and the hand-written guide ever
  disagree about a single field.

## 0.20.0

### Fixed

- **A date that cannot exist is now refused instead of being quietly turned into a different one.** Every
  calendar date in an agent write proposal — when a repot happened, when substrate was refreshed, when a
  plant was acquired, when a progress entry or clinical record was recorded — used to be checked only for
  its SHAPE. A value like `2026-02-31` passed, and the date machinery then rolled it forward to March 3rd.
  The owner would read and approve one date and a different one would be saved and audited. Impossible dates
  are now rejected outright, naming the field, and real leap days (`2024-02-29`) still pass.

## 0.19.0

### Added

- **The agents' species-context builder now lives here, once.** `buildSpeciesContext` — the function that
  turns a raw species row into the shape an agent reasons over — is available at
  `@retaxmaster/my-plants-species-schema/agent-kit/species-context`. It normalizes the record through the
  contract's own parser (so a legacy English-only row is handed to the agent in the bilingual shape the
  contract promises, instead of raw), treats an empty or whitespace-only research brief as absent, and
  enforces that an agent receives the research brief **or** the transitional blogpost fallback, never both.
  It previously existed as two separate copies, one inside the Plant Doctor and one inside the Gardener;
  both are gone. One implementation means a correction to how species knowledge is prepared reaches every
  agent at once, instead of whichever repo somebody remembered to edit.

### Changed

- **Writing a species record now rejects the removed `repotting.signs` field instead of silently dropping
  it.** Repotting signs moved to their own structured, bilingual catalogue, and the field was taken out of
  the record. Until now the write path still *accepted* a record that carried it, discarded the value, and
  reported success — so a curation run could hand over signs, be told everything was fine, and have them
  vanish. The write path now refuses the record and says where the signs belong. **Reading is unchanged and
  stays tolerant**: records stored before the move still parse exactly as they did.
- **Field guidance survives on the write contract.** The per-field descriptions that tell a curating agent
  what each field expects are now attached to both the reading and the writing contract, so tools generated
  from the write contract carry the same instructions instead of blank cells.

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
