import { isAbsolute } from 'node:path';

/**
 * Resolve a per-session scratch dir from an injected env var. FAIL CLOSED: a tool with no workspace must
 * stop, never guess a directory and never fall back to cwd — the whole point of the pin is that the
 * platform chose the location. The VARIABLE NAME is the per-agent difference (the doctor's is
 * PLANT_DOCTOR_SESSION_WORKSPACE), so it is a parameter rather than a second copy of this function.
 */
export function resolveSessionWorkspace(envName: string, env: NodeJS.ProcessEnv = process.env): string {
  const dir = env[envName];
  if (!dir) {
    throw new Error(
      `Missing ${envName}. The platform must inject the absolute session-workspace path before a tool runs.`,
    );
  }
  if (!isAbsolute(dir)) throw new Error(`${envName} must be an absolute path; got "${dir}".`);
  return dir;
}
