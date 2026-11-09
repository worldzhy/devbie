/**
 * Structural .env parser/serializer.
 *
 * Unlike the legacy CLI, which parsed `.env` into a flat object and rewrote the
 * whole file (destroying comments, blank lines and grouping), every assemble
 * step edits a list of typed lines so user-authored content is preserved.
 */

export type EnvLine =
  { kind: "blank" } | { kind: "comment"; text: string } | { kind: "entry"; key: string; value: string };

const SINGLE_ENTRY_RE = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*([\s\S]*?)\s*$/;
const SECTION_TITLE_RE = /^# ! (.+) variables\s*$/;
const DECORATION_RE = /^#\s*-{5,}\s*$/;

/** Deterministic code-unit order, matching the sort() precedent in module-closure. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Parse the textual content of a .env file into typed lines.
 * Quoted values keep their inner content verbatim (quotes stripped).
 */
export function parseEnv(content: string): EnvLine[] {
  const normalized = content.replace(/\r\n?/g, "\n");
  const rawLines = normalized.split("\n");

  // A trailing newline produces a spurious empty final element; drop only that one.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }

  const lines: EnvLine[] = [];

  for (const raw of rawLines) {
    if (raw.trim() === "") {
      lines.push({ kind: "blank" });
      continue;
    }
    if (raw.trimStart().startsWith("#")) {
      lines.push({ kind: "comment", text: raw });
      continue;
    }

    const match = raw.match(SINGLE_ENTRY_RE);
    if (!match) {
      // Unrecognized non-empty, non-comment line: keep it verbatim as a comment
      // so the round-trip never destroys content.
      lines.push({ kind: "comment", text: raw });
      continue;
    }

    const [, key, rawValue] = match;
    lines.push({ kind: "entry", key, value: unquote(rawValue.trim()) });
  }

  return lines;
}

function unquote(value: string): string {
  const quote = value[0];
  if (quote === '"' || quote === "'" || quote === "`") {
    if (value[value.length - 1] === quote) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Serialize typed lines back to text. Values needing quoting are wrapped in
 * double quotes; ordinary values stay bare for maximum diff-compatibility.
 */
export function serializeEnv(lines: EnvLine[]): string {
  const text = lines
    .map((line) => {
      if (line.kind === "blank") return "";
      if (line.kind === "comment") return line.text;
      return `${line.key}=${formatValue(line.value)}`;
    })
    .join("\n");

  return text.length > 0 ? `${text}\n` : "";
}

function formatValue(value: string): string {
  if (value.includes("\n") || /^[\s]|[\s]$/.test(value) || value.includes("#")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** Extract a flat key/value map from parsed lines. */
export function envValues(lines: EnvLine[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of lines) {
    if (line.kind === "entry") {
      result[line.key] = line.value;
    }
  }
  return result;
}

/** Remove entries whose key is in `keys`. Comments and blank lines are kept. */
export function removeEnvKeys(lines: EnvLine[], keys: ReadonlySet<string>): EnvLine[] {
  return lines.filter((line) => line.kind !== "entry" || !keys.has(line.key));
}

/**
 * Index where a section block begins. `sectionHeader()` renders a block as
 * `blank, decoration, "# ! <title> variables", decoration, entries`, so the
 * leading blank (when present) and the decoration above the title belong to
 * the block and must move/delete together with it.
 */
function sectionBlockStart(lines: EnvLine[], titleIndex: number): number {
  const before = lines[titleIndex - 1];
  if (before?.kind === "comment" && DECORATION_RE.test(before.text)) {
    const earlier = lines[titleIndex - 2];
    return earlier?.kind === "blank" ? titleIndex - 2 : titleIndex - 1;
  }
  return titleIndex;
}

function findSectionRange(lines: EnvLine[], title: string): { start: number; end: number } | null {
  const titleIndex = lines.findIndex(
    (line) => line.kind === "comment" && line.text.match(SECTION_TITLE_RE)?.[1] === title,
  );
  if (titleIndex === -1) return null;

  const start = sectionBlockStart(lines, titleIndex);

  // The block ends where the next section block starts, so entries appended to
  // this section never land inside a following section's body.
  let end = lines.length;
  for (let i = titleIndex + 1; i < lines.length; i++) {
    const candidate = lines[i];
    if (candidate.kind === "comment" && SECTION_TITLE_RE.test(candidate.text)) {
      end = sectionBlockStart(lines, i);
      break;
    }
  }

  return { start, end };
}

function sectionHeader(title: string): EnvLine[] {
  return [
    { kind: "blank" },
    {
      kind: "comment",
      text: "# ----------------------------------------------------------------------------------",
    },
    { kind: "comment", text: `# ! ${title} variables` },
    {
      kind: "comment",
      text: "# ----------------------------------------------------------------------------------",
    },
  ];
}

/**
 * Map each generated section title to the indices of its body entries: the
 * entry run immediately following the `# ! <title> variables` header (after
 * its closing decoration). This is the same body convention
 * `normalizeSections` uses, so both agree on what the CLI owns.
 */
function generatedSectionBodies(lines: EnvLine[]): Map<string, Set<number>> {
  const bodies = new Map<string, Set<number>>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind !== "comment") continue;
    const match = line.text.match(SECTION_TITLE_RE);
    if (!match) continue;

    let j = i + 1;
    const decoration = lines[j];
    if (decoration?.kind === "comment" && DECORATION_RE.test(decoration.text)) j += 1;

    const body = bodies.get(match[1]) ?? new Set<number>();
    while (j < lines.length && lines[j].kind === "entry") {
      body.add(j);
      j += 1;
    }
    bodies.set(match[1], body);
    i = j - 1;
  }
  return bodies;
}

/**
 * Insert missing entries under a `# ! <title> variables` section.
 *
 * Deduplication is scoped to the section itself. Ownership of keys shared by
 * several modules is the caller's concern (assembleEnv grants a shared key to
 * the alphabetically first declarer and only upserts owned keys, R29-01);
 * this primitive stays section-scoped.
 *
 * Entries written outside every generated section are user-authored, so a key
 * the user already defined by hand counts as satisfied — appending an empty
 * example would produce a duplicate that dotenv resolves last-wins, silently
 * blanking the real value. Keys already present in this section are never
 * overwritten. Idempotent across re-runs.
 */
export function upsertEnvSection(lines: EnvLine[], title: string, entries: Record<string, string>): EnvLine[] {
  const newKeys = Object.keys(entries);
  if (newKeys.length === 0) return lines;

  const bodies = generatedSectionBodies(lines);
  const ownBody = bodies.get(title) ?? new Set<number>();
  const managed = new Set<number>();
  for (const body of bodies.values()) {
    for (const index of body) managed.add(index);
  }

  const sectionKeys = new Set<string>();
  const handwrittenKeys = new Set<string>();
  lines.forEach((line, index) => {
    if (line.kind !== "entry") return;
    if (ownBody.has(index)) sectionKeys.add(line.key);
    else if (!managed.has(index)) handwrittenKeys.add(line.key);
  });

  const missing: EnvLine[] = newKeys
    .filter((key) => !sectionKeys.has(key) && !handwrittenKeys.has(key))
    .map((key) => ({ kind: "entry", key, value: entries[key] }));

  const range = findSectionRange(lines, title);
  if (!range) {
    if (missing.length === 0) return lines;
    return [...lines, ...sectionHeader(title), ...missing];
  }

  if (missing.length === 0) return lines;
  const next = [...lines];
  next.splice(range.end, 0, ...missing);
  return next;
}

/**
 * Converge shared keys onto their owner section (R29-01).
 *
 * assembleEnv grants a key declared by several modules to the alphabetically
 * first declarer. Copies left in non-owner sections are duplicates dotenv
 * resolves last-wins, so an empty example in a later section can silently
 * blank the real value: every generated copy of the key is removed and the
 * key is re-added under the owner section with the best value found (owner's
 * own copy first, then other copies in file order; first non-empty wins).
 * Hand-written entries outside generated sections are never touched, and when
 * one exists it counts as satisfied (see upsertEnvSection), so no generated
 * copy is re-added. Idempotent; keys without non-owner copies are left
 * byte-identical.
 */
export function relocateSharedEnvKeys(
  lines: EnvLine[],
  owners: ReadonlyMap<string, string>,
): { lines: EnvLine[]; migrated: Map<string, string> } {
  let next = lines;
  const migrated = new Map<string, string>();

  for (const [key, ownerTitle] of owners) {
    const bodies = generatedSectionBodies(next);
    const copies: { index: number; value: string; owner: boolean }[] = [];
    for (const [title, body] of bodies) {
      for (const index of body) {
        const line = next[index];
        if (line.kind === "entry" && line.key === key) {
          copies.push({ index, value: line.value, owner: title === ownerTitle });
        }
      }
    }

    const nonOwnerCopies = copies.filter((copy) => !copy.owner);
    if (nonOwnerCopies.length === 0) continue;

    const ownerCopy = copies.find((copy) => copy.owner);
    const candidates = ownerCopy === undefined ? nonOwnerCopies : [ownerCopy, ...nonOwnerCopies];
    const best = candidates.map((copy) => copy.value).find((value) => value !== "") ?? "";

    const drop = new Set(copies.map((copy) => copy.index));
    next = next.filter((_, index) => !drop.has(index));
    migrated.set(key, best);
    next = upsertEnvSection(next, ownerTitle, { [key]: best });
  }

  return { lines: next, migrated };
}

/**
 * Drop generated section blocks whose body contains no entry lines
 * (e.g. after all variables of a removed module were deleted).
 */
export function pruneEmptySections(lines: EnvLine[]): EnvLine[] {
  const titles: string[] = [];
  for (const line of lines) {
    if (line.kind === "comment") {
      const match = line.text.match(SECTION_TITLE_RE);
      if (match) titles.push(match[1]);
    }
  }

  let next = lines;
  for (const title of titles) {
    const range = findSectionRange(next, title);
    if (!range) continue;
    const body = next.slice(range.start, range.end);
    if (!body.some((line) => line.kind === "entry")) {
      // The block's own leading blank is removed with it; only swallow the
      // separator blank when the block itself did not start with one.
      const startedWithBlank = next[range.start]?.kind === "blank";
      next = [...next.slice(0, range.start), ...next.slice(range.end)];
      if (!startedWithBlank && next[range.start]?.kind === "blank") {
        next = [...next.slice(0, range.start), ...next.slice(range.start + 1)];
      }
    }
  }
  return next;
}

export const MODULES_MARKER_START = "# @@newbie-modules-start";
export const MODULES_MARKER_END = "# @@newbie-modules-end";

/**
 * Canonicalize CLI-generated `# ! <title> variables` sections: section blocks
 * are ordered by title and entries within a section by key — the same order
 * assembleEnvExample writes into .env.example. Only canonical blocks move:
 * the three-line decorated header plus its immediately following entry run.
 * Everything else (comments, blank lines, user-authored variables) is kept
 * verbatim in place. Idempotent.
 */
export function normalizeSections(lines: EnvLine[]): EnvLine[] {
  type EnvEntry = Extract<EnvLine, { kind: "entry" }>;
  const spans: { title: string; start: number; end: number; entries: EnvEntry[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind !== "comment") continue;
    const match = line.text.match(SECTION_TITLE_RE);
    if (!match) continue;

    // Swallow the canonical header prefix (decoration, leading blank) so the
    // block can be relocated without leaving orphan decoration lines behind.
    let start = i;
    if (lines[start - 1]?.kind === "comment" && DECORATION_RE.test((lines[start - 1] as { text: string }).text)) {
      start -= 1;
      if (lines[start - 1]?.kind === "blank") start -= 1;
    }

    // Body = the entry run immediately following the header; the first
    // non-entry line terminates it so foreign content is never swallowed.
    const entries: EnvEntry[] = [];
    let j = i + 1;
    if (lines[j]?.kind === "comment" && DECORATION_RE.test((lines[j] as { text: string }).text)) j += 1;
    while (j < lines.length) {
      const candidate = lines[j];
      if (candidate.kind !== "entry") break;
      entries.push(candidate);
      j += 1;
    }
    spans.push({ title: match[1], start, end: j, entries });
    i = j - 1;
  }
  if (spans.length === 0) return lines;

  const documentOrder = spans;
  const sorted = [...spans].sort((a, b) => compareStrings(a.title, b.title));

  const next: EnvLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === documentOrder[0].start) {
      for (const span of sorted) {
        next.push(...sectionHeader(span.title));
        next.push(...[...span.entries].sort((a, b) => compareStrings(a.key, b.key)));
      }
    }
    if (documentOrder.some((span) => i >= span.start && i < span.end)) continue;
    next.push(lines[i]);
  }
  return next;
}

/**
 * Replace (or append) the CLI-managed block in `.env.example` delimited by
 * @@newbie-modules markers. Content outside the block is user/template-owned.
 */
export function replaceMarkedBlock(content: string, body: string): string {
  const startIndex = content.indexOf(MODULES_MARKER_START);
  const endIndex = content.indexOf(MODULES_MARKER_END);

  const block = `${MODULES_MARKER_START}\n${body}${MODULES_MARKER_END}\n`;

  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
    const lineStart = content.lastIndexOf("\n", startIndex);
    const blockStart = lineStart === -1 ? 0 : lineStart + 1;
    const afterEnd = endIndex + MODULES_MARKER_END.length;
    return `${content.slice(0, blockStart)}${block}${content[afterEnd] === "\n" ? content.slice(afterEnd + 1) : content.slice(afterEnd)}`;
  }

  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${content}${separator}\n${block}`;
}
