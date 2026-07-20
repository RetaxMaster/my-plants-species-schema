import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { renderToolDoc } from './tool-doc.js';

const flat = z.object({ type: z.literal('demo'), name: z.string(), size: z.number().int().min(1).max(9).optional() }).strict();

describe('renderToolDoc', () => {
  it('renders a field table with required/optional + a validated example', () => {
    const md = renderToolDoc({
      title: 'Demo', tools: [{ name: 'demo', schema: flat, example: { type: 'demo', name: 'x', size: 3 } }],
      invariants: { schemaAttached: {}, external: [] },
    });
    expect(md).toContain('| `name` | string | required |');
    expect(md).toContain('"type": "demo"');
  });
  it('throws when an example does not satisfy its schema', () => {
    expect(() => renderToolDoc({
      title: 'Demo', tools: [{ name: 'demo', schema: flat, example: { type: 'demo' } }],
      invariants: { schemaAttached: {}, external: [] },
    })).toThrow(/example.*demo.*invalid/i);
  });
});
