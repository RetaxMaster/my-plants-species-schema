import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertInvariantsCover, GENERATED_MARKER, renderToolDoc, syncToolDoc } from './tool-doc.js';

const flat = z.object({
  type: z.literal('demo'),
  name: z.string(),
  size: z.number().int().min(1).max(9).optional(),
  mode: z.enum(['a', 'b']).optional(),
  tags: z.array(z.string()).optional(),
}).strict();

describe('renderToolDoc', () => {
  it('renders a field table with required/optional + a validated example', () => {
    const md = renderToolDoc({
      title: 'Demo', tools: [{ name: 'demo', schema: flat, example: { type: 'demo', name: 'x', size: 3 } }],
      invariants: { schemaAttached: {}, external: [] },
    });
    expect(md).toContain('# Demo');
    expect(md).toContain('| `name` | string | required |');
    expect(md).toContain('"type": "demo"');
    expect(md).toContain('| `size` | integer [1, 9] | optional |');
    expect(md).toContain('| `mode` | `a` \\| `b` | optional |');
    expect(md).toContain('| `tags` | array of string | optional |');
  });
  it('throws when an example does not satisfy its schema', () => {
    expect(() => renderToolDoc({
      title: 'Demo', tools: [{ name: 'demo', schema: flat, example: { type: 'demo' } }],
      invariants: { schemaAttached: {}, external: [] },
    })).toThrow(/example.*demo.*invalid/i);
  });
  it('reports "object" (not the ZodEffects internal name) for a refined+defaulted object section', () => {
    const misting = z.object({ frequency: z.string() }).refine((v) => v.frequency.length > 0).default({ frequency: 'weekly' });
    const md = renderToolDoc({
      title: 'Demo',
      tools: [{ name: 'demo', schema: z.object({ type: z.literal('demo'), misting }).strict(), example: { type: 'demo' } }],
      invariants: { schemaAttached: {}, external: [] },
    });
    expect(md).toContain('| `misting` | object | optional |');
    expect(md).not.toContain('effects');
  });
  it('throws a non-object error for a non-object tool schema', () => {
    expect(() => renderToolDoc({
      title: 'x', tools: [{ name: 'bad', schema: z.string(), example: 'y' }],
      invariants: { schemaAttached: {}, external: [] },
    })).toThrow(/non-object/i);
  });
  it('renders every schemaAttached entry under a Cross-field invariants section, keyed by section name', () => {
    const md = renderToolDoc({
      title: 'Demo', tools: [{ name: 'demo', schema: flat, example: { type: 'demo', name: 'x' } }],
      invariants: { schemaAttached: { demoSection: 'a <= b always' }, external: [] },
    });
    expect(md).toContain('### Cross-field invariants');
    expect(md).toContain('- **demoSection:** a <= b always');
  });
  it('shows exclusive bounds for .positive() and inclusive bounds for .nonnegative()', () => {
    const bounded = z.object({
      type: z.literal('demo'),
      posInt: z.number().int().positive(),
      nonNeg: z.number().nonnegative(),
    }).strict();
    const md = renderToolDoc({
      title: 'Demo', tools: [{ name: 'demo', schema: bounded, example: { type: 'demo', posInt: 1, nonNeg: 0 } }],
      invariants: { schemaAttached: {}, external: [] },
    });
    expect(md).toContain('| `posInt` | integer (0, ∞] | required |');
    expect(md).toContain('| `nonNeg` | number [0, ∞] | required |');
  });
});

const refined = z.object({ min: z.number(), max: z.number() }).refine((v) => v.min <= v.max, { message: 'min<=max' });

describe('assertInvariantsCover', () => {
  it('throws when a schema-level refine has no map entry', () => {
    expect(() => assertInvariantsCover({ demo: refined }, { schemaAttached: {}, external: [] }))
      .toThrow(/undocumented invariant.*demo/i);
  });
  it('throws when a map entry names a section that has no refine', () => {
    expect(() => assertInvariantsCover({ demo: z.object({ a: z.number() }) }, { schemaAttached: { demo: 'x' }, external: [] }))
      .toThrow(/no refine.*demo/i);
  });
  it('passes when refine and map entry agree', () => {
    expect(() => assertInvariantsCover({ demo: refined }, { schemaAttached: { demo: 'min<=max' }, external: [] })).not.toThrow();
  });
  it('detects a refine wrapped in .default()', () => {
    const wrapped = z.object({ a: z.number(), b: z.number() }).refine((v) => v.a <= v.b).default({ a: 0, b: 0 });
    expect(() => assertInvariantsCover({ demo: wrapped }, { schemaAttached: {}, external: [] })).toThrow(/undocumented invariant/i);
  });
});

describe('syncToolDoc', () => {
  it('refuses to overwrite a file without the generated marker', () => {
    expect(syncToolDoc({ path: '/nonexistent/but/unreadable', content: 'x', mode: 'check', currentReader: () => 'HAND WRITTEN' }).problems[0])
      .toMatch(/no generated-by marker/i);
  });
  it('reports STALE in check mode when content differs', () => {
    const r = syncToolDoc({ path: 'p', content: `${GENERATED_MARKER}\nnew`, mode: 'check', currentReader: () => `${GENERATED_MARKER}\nold` });
    expect(r.problems[0]).toMatch(/stale/i);
  });
});
