# my-plants-species-schema

The **shared data contract** for the MyPlants system: a [Zod](https://zod.dev) schema, its
inferred TypeScript types, and validators for the **curated species record** — the structured
shape a plant's care knowledge takes once it has been researched and curated.

This package is the **single source of truth** for that shape. Every other repo in the system
imports it instead of redefining the record locally, so the contract can never drift between
producers and consumers.

## Where it fits

MyPlants is a Git multirepo. This package sits at the root of the dependency graph — build it
first, because everything else depends on it:

```
my-plants-species-schema   ← you are here (the contract)
        │
        ├── my-plants-knowledge-engine   produces curated records (validates against this schema)
        ├── my-plants-api                consumes records to drive the deterministic care engine
        └── my-plants-web                consumes record-derived types for the UI
```

Sibling repos:

- [my-plants-knowledge-engine](https://github.com/RetaxMaster/my-plants-knowledge-engine)
- [my-plants-api](https://github.com/RetaxMaster/my-plants-api)
- [my-plants-web](https://github.com/RetaxMaster/my-plants-web)

## Requirements

- Node.js 20+
- npm

## Install & run

```bash
npm install       # install dependencies
npm run build     # compile to dist/ (tsc)
npm test          # run the Zod schema + validator tests (vitest)
npm run typecheck # type-only check (tsc --noEmit)
```

There is no runtime service and no `.env` — this is a library.

## How consumers depend on it

Consumers do **not** reference this repo by a relative path. The package is **packed into a
tarball** (`npm pack`) and installed into each consumer, so every consumer pins an exact,
reproducible version of the contract. In the orchestrator workspace this is automated by
`scripts/pack-species-schema-and-install.sh`, which tests, builds, packs, and installs the fresh
tarball into all consumers. **After any change to this schema, re-pack and re-install it in the
consumers before they rely on the new contract.**

## Public API

The package exports the curated species record schema, its inferred types, and validation
helpers. Import them from the package root:

```ts
import { /* schema, types, validators */ } from "@retaxmaster/my-plants-species-schema";
```

See `src/` for the exact exports.

### agent-kit

`agent-kit` is the shared scaffolding every agent repo (the Plant Doctor, the Knowledge Engine,
and any future agent) builds its `scripts/` on, hosted here as narrow subpaths so each consumer
only pulls in what it actually imports:

- `@retaxmaster/my-plants-species-schema/agent-kit/workspace` — session-workspace resolution.
- `@retaxmaster/my-plants-species-schema/agent-kit/api` — the bearer-token API client.
- `@retaxmaster/my-plants-species-schema/agent-kit/db` — the read connection to the API-owned
  MariaDB.
- `@retaxmaster/my-plants-species-schema/agent-kit/codex-parity` — the Codex-parity barrel
  (`codex-agent`, `codex-delegation`, `verification-record`).
- `@retaxmaster/my-plants-species-schema/agent-kit/codex-parity/repo-checks` — the two
  parameterized repo-level Codex-parity assertions, exported on their **own** subpath rather
  than folded into the barrel above: `repo-checks.ts` imports `vitest`, and the barrel also
  carries `verification-record`, which non-test runtime code genuinely imports — bundling both
  together would crash any non-test consumer of the barrel at import time.
- `@retaxmaster/my-plants-species-schema/agent-kit/guide-pair` — the `checkGuidePair` helper
  (see below).

Two bins ship alongside: `agent-kit-codex-agents` and `agent-kit-codex-spawn-schema`, meant to
be run from the consuming agent repo's own root (via its own `npm run` scripts), never from
inside this package.

`mysql2`, `execa`, `yaml` and `smol-toml` are declared as **optional peer dependencies** — being
*optional* is what tells npm never to auto-install them at all, for any consumer, regardless of
what that consumer imports (a *required* peer, by contrast, npm ≥7 installs for every consumer
whether they need it or not). What actually keeps a consumer that only needs `agent-kit/workspace`
free of a `mysql2` **import error** is a separate mechanism: Node's ESM resolution is per-file and
lazy, so a subpath a consumer never imports (`agent-kit/db`) never triggers its dependency's
resolution in the first place. A consumer that DOES import `agent-kit/db` must install `mysql2`
itself.

`checkGuidePair` asserts **whole-file byte equality** between `CLAUDE.md` and `AGENTS.md`,
exempting only the H1 and one correctly-paired self-reference line. That is stronger than the
workspace's intent-parity rule, deliberately: both existing agent repos satisfy it by stating
**both** runtimes' delegation syntax in **both** files.
