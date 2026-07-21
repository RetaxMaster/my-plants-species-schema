export * from './codex-agent.js';
export * from './codex-delegation.js';
export * from './verification-record.js';

// ⚠️ Deliberately NOT re-exporting `./repo-checks.js` here. `repo-checks.ts` imports `expect` from
// `vitest`, and importing any vitest export outside an active vitest worker crashes the process at
// import time ("Vitest failed to access its internal state") — verified empirically. This barrel also
// carries `verification-record.js`, which non-test CLI code (and, transitively, the API-adjacent
// tooling) genuinely imports; ES modules execute their whole top level on import regardless of which
// named export a consumer actually reaches for, so bundling `repo-checks` in here would crash every
// non-test consumer of this barrel the moment they imported anything from it at all.
//
// `repo-checks.ts` gets its own narrow subpath export instead — `./agent-kit/codex-parity/repo-checks`
// (see package.json) — so each agent repo's one-line test file can still reach it directly without
// pulling `vitest` into any runtime import of this barrel.
