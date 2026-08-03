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
  /**
   * Field keys this tool's audience MUST always supply, even though the shared schema marks them
   * `.optional()`. Fed from the capability map's `requireFields`, the mirror of `omitFields`.
   *
   * ⚠️ THE DEFECT THIS CLOSES, stated plainly so nobody re-introduces it by "simplifying" the renderer back
   * to the schema alone: the `Required` column used to be computed from the Zod node ONLY. That is wrong by
   * construction here, because the operation union is SCOPE-AGNOSTIC — one union serves the doctor and the
   * gardener — while this renderer emits a doc for exactly ONE scope. It already knew the scope (it filters
   * operations and strips fields through the capability map); the `Required` column simply never consulted
   * it. Result: all eleven of the gardener's plant-scoped operations documented `plantId` as "optional"
   * while the API refused the operation without it, twice over. Optionality in a shared schema is a
   * statement about the UNION; required-ness in a generated doc is a statement about the READER.
   */
  requireFields?: readonly string[];
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
  else if (t === 'ZodUnion') {
    // A union renders as its members, not as the bare word "union". The bilingual free-text fields are
    // unions (legacy string | { en, es }), and "union" in a tool doc teaches an agent nothing.
    label = (inner._def.options as z.ZodTypeAny[]).map((o) => describeType(o)).join(' \\| ');
  }
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

/**
 * A field's `.describe()` text, found through the wrapper chain. `.describe()` sets `_def.description` on
 * whatever node it was called on, so `z.number().describe('…').nullable()` parks it on the INNER node —
 * peel exactly the same wrappers `unwrap` does, plus ZodEffects, or half the descriptions render blank.
 */
function fieldDescription(schema: z.ZodTypeAny): string {
  let s: z.ZodTypeAny = schema;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const d = s._def.description;
    if (typeof d === 'string' && d.length > 0) return d;
    const t = s._def.typeName;
    if (t === 'ZodOptional' || t === 'ZodNullable' || t === 'ZodDefault') s = s._def.innerType;
    else if (t === 'ZodEffects') s = s._def.schema;
    else return '';
  }
}

/** A description is one Markdown table CELL: no newlines, and every pipe escaped. */
function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * The whole field table — header, separator and rows — because the header's SHAPE now depends on the rows:
 * the `Description` column appears only when some field in THIS table carries one. That keeps every
 * already-generated doc byte-identical until its schema actually gains a description, so this change alone
 * cannot make a downstream `tools:check` go red.
 *
 * The zero-entries case (every field is `type` or `omit`ted — happens for a sub-table whose own shape is
 * entirely omitted, or for a genuinely empty object) needs its OWN placeholder row, `['']`, instead of
 * falling out to `[]`. The predecessor `fieldRows()` built its rows via `rows.join('\n')` and always
 * contributed that joined STRING as one array element in the caller's `parts.push(..., fieldRows(...), '')`
 * composition. When entries has 1+ rows, that is byte-identical to pushing the rows as separate elements
 * (`Array.join('\n')` doesn't care whether a newline came from between elements or was embedded in one of
 * them). But when entries is EMPTY, `[].join('\n')` is `''` — an extra blank-line element the old code
 * always contributed, that a naive `[...header, ...rows]` with `rows = []` silently drops. Keeping `['']`
 * here reproduces that exact quirk, so the output stays byte-identical for every description-free schema,
 * not only the ones with at least one field — see the plan's Task 7 promise and the regression test below.
 */
function fieldTable(
  schema: z.ZodTypeAny,
  omit: readonly string[] = [],
  require: readonly string[] = [],
): string[] {
  const shape = objectShape(schema);
  const entries = Object.entries(shape).filter(([key]) => key !== 'type' && !omit.includes(key));
  const described = entries.some(([, field]) => fieldDescription(field) !== '');
  const header = described
    ? ['| Field | Type | Required | Description |', '|---|---|---|---|']
    : ['| Field | Type | Required |', '|---|---|---|'];
  const rows = entries.length === 0
    ? ['']
    : entries.map(([key, field]) => {
        // The scope's own requirement OVERRIDES the schema's optionality — never the reverse. A field the
        // capability map marks required for this audience is required in this audience's doc, whatever the
        // shared union says; a field the map says nothing about falls back to the schema, so every existing
        // doc stays byte-identical until its scope actually gains a `requireFields` entry.
        const { optional } = unwrap(field);
        const isRequired = require.includes(key) || !optional;
        const base = `| \`${key}\` | ${describeType(field)} | ${isRequired ? 'required' : 'optional'} |`;
        return described ? `${base} ${cell(fieldDescription(field))} |` : base;
      });
  return [...header, ...rows];
}

/** True when `inner` (already unwrapped) is directly a ZodObject, or a ZodEffects wrapping one. */
function isObjectNode(inner: z.ZodTypeAny): boolean {
  return (
    inner._def.typeName === 'ZodObject' ||
    (inner._def.typeName === 'ZodEffects' && inner._def.schema?._def?.typeName === 'ZodObject')
  );
}

/** One-level sub-tables: for each object-typed field of `schema` — or each ARRAY-of-object field, in which
 * case the sub-table documents the ELEMENT shape, not the array itself — render its own field table. Does
 * not recurse past one level (a nested object's nested objects render only as `object`), which is enough to
 * surface a section's enum vocabularies and numeric bounds without unbounded expansion. */
function subTables(schema: z.ZodTypeAny, omit: readonly string[] = []): string[] {
  const shape = objectShape(schema);
  const out: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    if (key === 'type' || omit.includes(key)) continue;
    const { inner } = unwrap(field);
    if (isObjectNode(inner)) {
      // No `omit` passed here: the omit set is top-level-only, and an omitted object field's sub-table
      // is already skipped by the loop guard above before this line is ever reached.
      out.push(`#### \`${key}\``, '', ...fieldTable(field), '');
    } else if (inner._def.typeName === 'ZodArray') {
      const { inner: elementInner } = unwrap(inner._def.type as z.ZodTypeAny);
      if (isObjectNode(elementInner)) {
        // Document the ARRAY ELEMENT's shape (the object type inside the array), not the array wrapper.
        out.push(`#### \`${key}\``, '', ...fieldTable(inner._def.type as z.ZodTypeAny), '');
      }
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
    // `requireFields`, like `omitFields`, is TOP-LEVEL ONLY — it is not threaded into `subTables` below.
    // That is deliberate and not an omission: both sets name keys on the operation object itself (today,
    // only `plantId`), and a nested object's own members are described by the shared schema alone, where
    // there is no scope to disagree with.
    parts.push(...fieldTable(tool.schema, tool.omitFields, tool.requireFields), '');
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
