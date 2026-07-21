import { describe, expect, it } from 'vitest';
import { agentRepoRoot } from './repo-root.js';

describe('agentRepoRoot', () => {
  it('defaults to the process cwd, never to this module location', () => {
    expect(agentRepoRoot({})).toBe(process.cwd());
  });
  it('honors an explicit override', () => {
    expect(agentRepoRoot({ AGENT_KIT_REPO_ROOT: '/x' })).toBe('/x');
  });
});
