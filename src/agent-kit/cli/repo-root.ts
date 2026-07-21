/**
 * The consuming agent repo's root. npm runs a package script with cwd = that repo's root, which is why
 * cwd is correct here and `import.meta.url` is NOT: these CLIs now execute from inside node_modules, so
 * a path derived from their own location points into the dependency instead of the repo being linted.
 * `AGENT_KIT_REPO_ROOT` is the escape hatch for a caller that cannot control cwd.
 */
export function agentRepoRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGENT_KIT_REPO_ROOT ?? process.cwd();
}
