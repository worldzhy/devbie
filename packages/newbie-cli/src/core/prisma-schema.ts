/**
 * Update the `schemas = [...]` array inside the prisma datasource block.
 * Non-module entries (e.g. "application") are preserved; module entries are
 * addressed by their PostgreSQL namespace name (`module/<key>`).
 */

// Bounded to a single datasource block: `[^}]*` stops at the block's closing
// brace, so a greedy scan cannot drift into a later block or comment that
// happens to mention `schemas =`.
const DATASOURCE_SCHEMAS_RE = /(datasource\s+[A-Za-z_][A-Za-z0-9_]*\s*\{[^}]*schemas\s*=\s*)(\[[^\]]*\])/;

export function updateDatasourceSchemas(content: string, addedPaths: string[], removedPaths: string[]): string {
  return content.replace(DATASOURCE_SCHEMAS_RE, (_whole, prefix: string, arrayLiteral: string) => {
    let current: string[] = [];
    try {
      current = JSON.parse(`{"val": ${arrayLiteral}}`).val as string[];
    } catch {
      throw new Error("[Error] Cannot parse schemas array in prisma/schema.prisma");
    }

    const removed = new Set(removedPaths);
    const next = Array.from(new Set([...current.filter((entry) => !removed.has(entry)), ...addedPaths]));
    return `${prefix}${JSON.stringify(next).replace(/,/g, ", ")}`;
  });
}

/**
 * Reconcile the `schemas = [...]` array to exactly the desired module
 * namespaces. Non-module entries (e.g. "application") are preserved; every
 * entry starting with "module/" is replaced by the supplied set. This makes
 * the datasource block convergent instead of diff-based, so orphan entries
 * left by out-of-band module removal are dropped.
 */
export function reconcileDatasourceSchemas(content: string, moduleNamespaces: string[]): string {
  return content.replace(DATASOURCE_SCHEMAS_RE, (_whole, prefix: string, arrayLiteral: string) => {
    let current: string[] = [];
    try {
      current = JSON.parse(`{"val": ${arrayLiteral}}`).val as string[];
    } catch {
      throw new Error("[Error] Cannot parse schemas array in prisma/schema.prisma");
    }

    const nonModule = current.filter((entry) => !entry.startsWith("module/"));
    const next = Array.from(new Set([...nonModule, ...moduleNamespaces]));
    return `${prefix}${JSON.stringify(next).replace(/,/g, ", ")}`;
  });
}

/** Namespace name used inside the datasource schemas array for a module key. */
export function moduleSchemaNamespace(key: string): string {
  return `module/${key}`;
}

/** Read the current datasource schemas list; null when absent/unparseable. */
export function readDatasourceSchemas(content: string): string[] | null {
  const match = content.match(DATASOURCE_SCHEMAS_RE);
  if (!match) return null;
  try {
    return JSON.parse(`{"val": ${match[2]}}`).val as string[];
  } catch {
    return null;
  }
}

/** Body offsets and declared field names of one `model X { ... }` block. */
interface ModelBlock {
  bodyStart: number;
  bodyEnd: number;
  fields: string[];
}

/** Index just past the closing quote of the string literal starting at `openIndex`. */
function skipString(content: string, openIndex: number): number {
  for (let index = openIndex + 1; index < content.length; index += 1) {
    if (content[index] === "\\") {
      index += 1;
      continue;
    }
    if (content[index] === '"') return index;
  }
  return -1;
}

/** Index of the `}` matching the `{` at `openIndex`; -1 when unbalanced. */
function findClosingBrace(content: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === "/" && content[index + 1] === "/") {
      const newline = content.indexOf("\n", index);
      if (newline === -1) return -1;
      index = newline;
      continue;
    }
    if (char === '"') {
      index = skipString(content, index);
      if (index === -1) return -1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

const MODEL_HEADER_RE = /(?:^|\n)[ \t]*model[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*\{/g;
const FIELD_NAME_RE = /^([A-Za-z_][A-Za-z0-9_]*)/;

/** Field names declared in a model body; `@@` block attributes are not fields. */
function readFieldNames(body: string): string[] {
  const names: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("@")) continue;
    const match = FIELD_NAME_RE.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

/** Index the `model` blocks of a schema fragment by model name. */
function readModelBlocks(content: string): Map<string, ModelBlock> {
  const blocks = new Map<string, ModelBlock>();
  MODEL_HEADER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MODEL_HEADER_RE.exec(content)) !== null) {
    const openIndex = MODEL_HEADER_RE.lastIndex - 1;
    const closeIndex = findClosingBrace(content, openIndex);
    if (closeIndex === -1) throw new Error(`[Error] Unclosed model block '${match[1]}' in a Prisma fragment`);
    blocks.set(match[1], {
      bodyStart: openIndex + 1,
      bodyEnd: closeIndex,
      fields: readFieldNames(content.slice(openIndex + 1, closeIndex)),
    });
    MODEL_HEADER_RE.lastIndex = closeIndex + 1;
  }
  return blocks;
}

export interface ModelFieldConflict {
  model: string;
  field: string;
}

export interface MergeModelAdditionsResult {
  content: string;
  /** Addition fields the module already declares; that model is left unmerged. */
  conflicts: ModelFieldConflict[];
  /** Models declared by the additions file but absent from the module fragment. */
  unknownModels: string[];
}

/**
 * Offset where additions belong: the start of the first `@@` block attribute
 * line, so the model keeps block attributes last; the body end when it has none.
 */
function additionAnchor(content: string, bodyStart: number, bodyEnd: number): number {
  let lineStart = bodyStart;
  while (lineStart < bodyEnd) {
    let lineEnd = content.indexOf("\n", lineStart);
    if (lineEnd === -1 || lineEnd > bodyEnd) lineEnd = bodyEnd;
    if (content.slice(lineStart, lineEnd).trimStart().startsWith("@@")) return lineStart;
    lineStart = lineEnd + 1;
  }
  return bodyEnd;
}

/**
 * Merge host-side model additions (ADR-020) into a module fragment.
 *
 * Append-only by construction: additions are inserted before each target
 * model's block attributes (or its closing brace when it has none). A
 * field-name collision refuses the whole model rather than overriding a
 * module-owned declaration — the caller must surface it so a module upgrade
 * that introduces the same field cannot be masked.
 */
export function mergeModelAdditions(base: string, additions: string): MergeModelAdditionsResult {
  const baseBlocks = readModelBlocks(base);
  const additionsBlocks = readModelBlocks(additions);
  const conflicts: ModelFieldConflict[] = [];
  const unknownModels: string[] = [];
  const insertions: { at: number; text: string }[] = [];

  for (const [name, block] of additionsBlocks) {
    const target = baseBlocks.get(name);
    if (!target) {
      unknownModels.push(name);
      continue;
    }
    const declared = new Set(target.fields);
    const colliding = block.fields.filter((field) => declared.has(field));
    if (colliding.length > 0) {
      conflicts.push(...colliding.map((field) => ({ model: name, field })));
      continue;
    }
    const lines = additions.slice(block.bodyStart, block.bodyEnd).split("\n");
    while (lines.length > 0 && lines[0].trim() === "") lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length === 0) continue;
    const at = additionAnchor(base, target.bodyStart, target.bodyEnd);
    const body = lines.join("\n");
    insertions.push({ at, text: at === target.bodyEnd ? `\n${body}\n` : `${body}\n\n` });
  }

  if (insertions.length === 0) return { content: base, conflicts, unknownModels };

  let merged = base;
  for (const insertion of insertions.sort((left, right) => right.at - left.at)) {
    merged = `${merged.slice(0, insertion.at)}${insertion.text}${merged.slice(insertion.at)}`;
  }
  return { content: merged, conflicts, unknownModels };
}
