import { z } from 'zod';

export interface InvariantMap {
  /** section/tool name → human sentence. Cross-checked against the schema's ZodEffects (tripwire). */
  schemaAttached: Record<string, string>;
  /** free-text invariants NOT attached to a ZodEffects (e.g. rules enforced outside the schema). */
  external: string[];
}
export interface ToolSpec {
  name: string;
  schema: z.ZodTypeAny;
  example: unknown;
  description?: string;
  /**
   * Field keys this tool's audience may NOT use, even though the shared schema defines them. Fed from
   * the capability map (spec §4.3/§4.4). Filtering by operation TYPE alone is not enough: a doc that
   * still advertises `placeId` teaches the agent about a field the API answers with VALIDATION.
   */
  omitFields?: readonly string[];
}
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
  // A refined/superRefine'd node (ZodEffects) carries no shape of its own — describe the schema it wraps.
  if (t === 'ZodEffects') {
    const recursed = describeType(inner._def.schema);
    return nullable ? `${recursed} \\| null` : recursed;
  }
  let label: string;
  if (t === 'ZodEnum') label = (inner._def.values as string[]).map((v) => `\`${v}\``).join(' \\| ');
  else if (t === 'ZodNativeEnum') {
    label = Object.values(inner._def.values as Record<string, unknown>)
      .filter((v) => typeof v === 'string')
      .map((v) => `\`${String(v)}\``)
      .join(' \\| ');
  }
  else if (t === 'ZodLiteral') label = `\`${String(inner._def.value)}\``;
  else if (t === 'ZodString') label = 'string';
  else if (t === 'ZodNumber') {
    const checks = inner._def.checks as { kind: string; value: number; inclusive?: boolean }[];
    const isInt = checks.some((c) => c.kind === 'int');
    const minChk = checks.find((c) => c.kind === 'min');
    const maxChk = checks.find((c) => c.kind === 'max');
    const lo = minChk ? `${minChk.inclusive === false ? '(' : '['}${minChk.value}` : '[−∞';
    const hi = maxChk ? `${maxChk.value}${maxChk.inclusive === false ? ')' : ']'}` : '∞]';
    const range = minChk || maxChk ? ` ${lo}, ${hi}` : '';
    label = `${isInt ? 'integer' : 'number'}${range}`;
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

function fieldRows(schema: z.ZodTypeAny, omit: readonly string[] = []): string {
  const shape = objectShape(schema);
  const rows: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    if (key === 'type' || omit.includes(key)) continue;
    const { optional } = unwrap(field);
    rows.push(`| \`${key}\` | ${describeType(field)} | ${optional ? 'optional' : 'required'} |`);
  }
  return rows.join('\n');
}

/** One-level sub-tables: for each object-typed field of `schema`, render its own field table. Does not
 * recurse past one level (a nested object's nested objects render only as `object`), which is enough to
 * surface a section's enum vocabularies and numeric bounds without unbounded expansion. */
function subTables(schema: z.ZodTypeAny, omit: readonly string[] = []): string[] {
  const shape = objectShape(schema);
  const out: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    if (key === 'type' || omit.includes(key)) continue;
    const { inner } = unwrap(field);
    const isObject =
      inner._def.typeName === 'ZodObject' ||
      (inner._def.typeName === 'ZodEffects' && inner._def.schema?._def?.typeName === 'ZodObject');
    if (isObject) {
      // No `omit` passed here: the omit set is top-level-only, and an omitted object field's sub-table
      // is already skipped by the loop guard above before this line is ever reached.
      out.push(`#### \`${key}\``, '', '| Field | Type | Required |', '|---|---|---|', fieldRows(field), '');
    }
  }
  return out;
}

/** Strips withheld top-level keys from the printed example. Rendering only — validation is untouched. */
function exampleForDoc(example: unknown, omit: readonly string[] = []): unknown {
  if (omit.length === 0 || example === null || typeof example !== 'object' || Array.isArray(example)) return example;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(example as Record<string, unknown>)) if (!omit.includes(k)) out[k] = v;
  return out;
}

export function renderToolDoc(input: RenderInput): string {
  const parts: string[] = [];
  parts.push(`# ${input.title}`, '');
  if (input.intro) parts.push(input.intro, '');
  for (const tool of input.tools) {
    const check = tool.schema.safeParse(tool.example);
    if (!check.success) {
      throw new Error(`tool-doc: the seeded example for "${tool.name}" is invalid: ${check.error.issues[0]?.message}`);
    }
    parts.push(`### \`${tool.name}\``, '');
    if (tool.description) parts.push(tool.description, '');
    parts.push('| Field | Type | Required |', '|---|---|---|', fieldRows(tool.schema, tool.omitFields), '');
    parts.push(...subTables(tool.schema, tool.omitFields));
    parts.push('```json', JSON.stringify(exampleForDoc(tool.example, tool.omitFields), null, 2), '```', '');
  }
  const attached = Object.entries(input.invariants.schemaAttached);
  if (attached.length) {
    parts.push('### Cross-field invariants', '');
    for (const [name, sentence] of attached) parts.push(`- **${name}:** ${sentence}`);
    parts.push('');
  }
  if (input.invariants.external.length) {
    parts.push('### Rules enforced outside the schema', '');
    for (const e of input.invariants.external) parts.push(`- ${e}`);
    parts.push('');
  }
  return parts.join('\n');
}

export const GENERATED_MARKER = '<!-- GENERATED FILE — do not edit. Run: npm run tools:generate -->';

/** True when a section schema (after peeling wrappers) is a ZodEffects carrying a refinement/superRefine. */
export function hasRefinement(schema: z.ZodTypeAny): boolean {
  const { inner } = unwrap(schema);
  return inner._def.typeName === 'ZodEffects' && inner._def.effect?.type === 'refinement';
}

/**
 * The tripwire. `sections` maps a name → the schema node to inspect. Every refined node MUST have a
 * `schemaAttached` entry, and every entry MUST name a refined node. A `.refine()` added or removed without
 * updating the map fails the build.
 */
export function assertInvariantsCover(sections: Record<string, z.ZodTypeAny>, invariants: InvariantMap): void {
  const refined = new Set(Object.entries(sections).filter(([, s]) => hasRefinement(s)).map(([k]) => k));
  for (const name of refined) {
    if (!(name in invariants.schemaAttached)) {
      throw new Error(`tool-doc: undocumented invariant on "${name}" — a .refine() exists but the invariant map has no entry. Add its human description to schemaAttached.`);
    }
  }
  for (const name of Object.keys(invariants.schemaAttached)) {
    if (!refined.has(name)) {
      throw new Error(`tool-doc: no refine found for section "${name}" but the invariant map documents one — remove the stale entry (the map is honest in both directions).`);
    }
  }
}

export interface SyncInput { path: string; content: string; mode: 'write' | 'check'; currentReader: () => string | null; writer?: (content: string) => void; }
export interface SyncResult { problems: string[]; wrote: boolean; }

/** Marker-protected write/check, mirroring generate-codex-agents.ts: never clobber a hand-written file. */
export function syncToolDoc(input: SyncInput): SyncResult {
  const current = input.currentReader();
  const body = input.content.startsWith(GENERATED_MARKER) ? input.content : `${GENERATED_MARKER}\n${input.content}`;
  if (current !== null && !current.startsWith(GENERATED_MARKER)) {
    return { problems: [`${input.path} exists and has no generated-by marker — refusing to overwrite a hand-written file.`], wrote: false };
  }
  if (current === body) return { problems: [], wrote: false };
  if (input.mode === 'check') {
    return { problems: [current === null ? `${input.path} is MISSING — run: npm run tools:generate` : `${input.path} is STALE — run: npm run tools:generate`], wrote: false };
  }
  const didWrite = Boolean(input.writer);
  input.writer?.(body);
  return { problems: [], wrote: didWrite };
}
