import { describe, expect, it } from 'vitest';
import { resolveSessionWorkspace } from './workspace.js';

describe('resolveSessionWorkspace', () => {
  it('returns the absolute path from the named variable', () => {
    expect(resolveSessionWorkspace('X_WS', { X_WS: '/tmp/ws' })).toBe('/tmp/ws');
  });
  it('fails closed when the variable is absent — never falls back to cwd', () => {
    expect(() => resolveSessionWorkspace('X_WS', {})).toThrow(/Missing X_WS/);
  });
  it('refuses a relative path', () => {
    expect(() => resolveSessionWorkspace('X_WS', { X_WS: 'ws' })).toThrow(/absolute/);
  });
});
