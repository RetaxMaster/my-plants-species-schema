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
