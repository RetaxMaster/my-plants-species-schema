import { z } from 'zod';

export interface InvariantMap {
  /** section/tool name → human sentence. Cross-checked against the schema's ZodEffects (tripwire). */
  schemaAttached: Record<string, string>;
  /** free-text invariants NOT attached to a ZodEffects (e.g. rules enforced outside the schema). */
  external: string[];
}
export interface ToolSpec { name: string; schema: z.ZodTypeAny; example: unknown; description?: string; }
export interface RenderInput { title: string; intro?: string; tools: ToolSpec[]; invariants: InvariantMap; }

/** Peel ZodDefault / ZodOptional / ZodNullable to reach the underlying type; report what we peeled. */
export function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean; nullable: boolean } {
  let s = schema, optional = false, nullable = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const t = s._def.typeName;
    if (t === 'ZodOptional') { optional = true; s = s._def.innerType; }
    else if (t === 'ZodNullable') { nullable = true; s = s._def.innerType; }
    else if (t === 'ZodDefault') { optional = true; s = s._def.innerType; }
    else break;
  }
  return { inner: s, optional, nullable };
}

/** A one-word type label + a value-vocabulary hint (enum options, numeric bounds). */
export function describeType(schema: z.ZodTypeAny): string {
  const { inner, nullable } = unwrap(schema);
  const t = inner._def.typeName;
  let label: string;
  if (t === 'ZodEnum') label = (inner._def.values as string[]).map((v) => `\`${v}\``).join(' \\| ');
  else if (t === 'ZodLiteral') label = `\`${String(inner._def.value)}\``;
  else if (t === 'ZodString') label = 'string';
  else if (t === 'ZodNumber') {
    const checks = inner._def.checks as { kind: string; value: number }[];
    const min = checks.find((c) => c.kind === 'min')?.value;
    const max = checks.find((c) => c.kind === 'max')?.value;
    const range = min !== undefined || max !== undefined ? ` [${min ?? '−∞'}, ${max ?? '∞'}]` : '';
    label = `number${range}`;
  }
  else if (t === 'ZodBoolean') label = 'boolean';
  else if (t === 'ZodArray') label = `array of ${describeType(inner._def.type)}`;
  else label = t.replace(/^Zod/, '').toLowerCase();
  return nullable ? `${label} \\| null` : label;
}

/** The object members of a schema, whether it is a plain object or wrapped in effects/defaults. */
function objectShape(schema: z.ZodTypeAny): z.ZodRawShape {
  const { inner } = unwrap(schema);
  if (inner._def.typeName === 'ZodEffects') return objectShape(inner._def.schema);
  if (inner._def.typeName === 'ZodObject') return (inner as z.ZodObject<z.ZodRawShape>).shape;
  throw new Error(`tool-doc: cannot introspect a non-object tool schema (${inner._def.typeName}).`);
}

function fieldRows(schema: z.ZodTypeAny): string {
  const shape = objectShape(schema);
  const rows: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    if (key === 'type') continue;
    const { optional } = unwrap(field);
    rows.push(`| \`${key}\` | ${describeType(field)} | ${optional ? 'optional' : 'required'} |`);
  }
  return rows.join('\n');
}

export function renderToolDoc(input: RenderInput): string {
  const parts: string[] = [];
  if (input.intro) parts.push(input.intro, '');
  for (const tool of input.tools) {
    const check = tool.schema.safeParse(tool.example);
    if (!check.success) {
      throw new Error(`tool-doc: the seeded example for "${tool.name}" is invalid: ${check.error.issues[0]?.message}`);
    }
    parts.push(`### \`${tool.name}\``, '');
    if (tool.description) parts.push(tool.description, '');
    parts.push('| Field | Type | Required |', '|---|---|---|', fieldRows(tool.schema), '');
    const inv = input.invariants.schemaAttached[tool.name];
    if (inv) parts.push(`**Invariant:** ${inv}`, '');
    parts.push('```json', JSON.stringify(tool.example, null, 2), '```', '');
  }
  if (input.invariants.external.length) {
    parts.push('### Rules enforced outside the schema', '');
    for (const e of input.invariants.external) parts.push(`- ${e}`);
    parts.push('');
  }
  return parts.join('\n');
}
