/**
 * Minimal unified diff generator (LCS-based line diff).
 *
 * Produces git-style unified diff output without external dependencies.
 * Only handles whole-line additions/deletions; inline hunk highlighting is
 * not needed for registry file updates.
 */

/** Compute the longest common subsequence of two string arrays. */
function lcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

interface DiffLine {
  type: " " | "+" | "-";
  text: string;
}

/**
 * Cap on DP cells (old lines × new lines). The LCS table is O(m×n); without a
 * guard a pathological file pair can exhaust memory and hang template updates.
 * Beyond the cap we emit a coarse replace-all diff, which is still valid.
 */
const MAX_LCS_CELLS = 1_000_000;

/** Coarse fallback: every old line removed, every new line added. */
function coarseDiff(a: string[], b: string[]): DiffLine[] {
  return [...a.map((text): DiffLine => ({ type: "-", text })), ...b.map((text): DiffLine => ({ type: "+", text }))];
}

/** Backtrack through the LCS table to produce the edit script. */
function backtrack(dp: number[][], a: string[], b: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: " ", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "+", text: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: "-", text: a[i - 1] });
      i--;
    }
  }
  return result;
}

/**
 * Generate a unified diff between two strings.
 *
 * @param oldContent Original content.
 * @param newContent New content.
 * @param oldLabel Label for the old file (e.g. "a/src/lib/api-client.ts").
 * @param newLabel Label for the new file (e.g. "b/src/lib/api-client.ts").
 * @returns Unified diff string, or empty string when contents are identical.
 */
export function unifiedDiff(oldContent: string, newContent: string, oldLabel: string, newLabel: string): string {
  const a = oldContent.split("\n");
  const b = newContent.split("\n");

  // Remove the trailing empty string caused by a final newline so the diff
  // does not report a spurious change at EOF.
  if (a.length > 0 && a[a.length - 1] === "") a.pop();
  if (b.length > 0 && b[b.length - 1] === "") b.pop();

  if (a.join("\n") === b.join("\n")) return "";

  const lines = a.length * b.length > MAX_LCS_CELLS ? coarseDiff(a, b) : backtrack(lcs(a, b), a, b);

  const out: string[] = [];
  out.push(`--- ${oldLabel}`);
  out.push(`+++ ${newLabel}`);

  // Group consecutive changes into hunks with 3 lines of context.
  const hunkSize = 3;
  let hunkStart = -1;
  let hunkEnd = -1;

  const flushHunk = () => {
    if (hunkStart === -1) return;
    const start = Math.max(0, hunkStart - hunkSize);
    const end = Math.min(lines.length - 1, hunkEnd + hunkSize);
    // Git prints a 0-based start for empty ranges (e.g. "@@ -0,0 +1,2 @@" for
    // a wholly new file); non-empty ranges are 1-based.
    const oldStart = oldLineNumber(lines, start);
    const newStart = newLineNumber(lines, start);
    const oldLen = hunkOldLength(lines, start, end);
    const newLen = hunkNewLength(lines, start, end);
    out.push(
      `@@ -${oldLen === 0 ? oldStart : oldStart + 1},${oldLen} +${newLen === 0 ? newStart : newStart + 1},${newLen} @@`,
    );
    for (let k = start; k <= end; k++) {
      out.push(`${lines[k].type}${lines[k].text}`);
    }
    hunkStart = -1;
    hunkEnd = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== " ") {
      if (hunkStart === -1) hunkStart = i;
      hunkEnd = i;
    } else if (hunkStart !== -1 && i - hunkEnd > hunkSize) {
      flushHunk();
    }
  }
  flushHunk();

  return out.join("\n") + "\n";
}

/** Count non-"+" lines up to index `idx` (old-file line offset). */
function oldLineNumber(lines: DiffLine[], idx: number): number {
  let n = 0;
  for (let i = 0; i < idx; i++) if (lines[i].type !== "+") n++;
  return n;
}

/** Count non-"-" lines up to index `idx` (new-file line offset). */
function newLineNumber(lines: DiffLine[], idx: number): number {
  let n = 0;
  for (let i = 0; i < idx; i++) if (lines[i].type !== "-") n++;
  return n;
}

function hunkOldLength(lines: DiffLine[], start: number, end: number): number {
  let n = 0;
  for (let i = start; i <= end; i++) if (lines[i].type !== "+") n++;
  return n;
}

function hunkNewLength(lines: DiffLine[], start: number, end: number): number {
  let n = 0;
  for (let i = start; i <= end; i++) if (lines[i].type !== "-") n++;
  return n;
}
