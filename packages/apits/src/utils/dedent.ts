/**
 * Tagged-template helper that strips the common leading whitespace from every
 * line. Multi-line interpolations keep the indentation of the line they are
 * embedded on (mirrors vtils `dedent`, which first runs `indent`).
 */
export function dedent(literals: TemplateStringsArray, ...interpolations: any[]): string {
  // Step 1: replicate vtils `indent` — when an interpolation spans multiple
  // lines, prefix every continuation line with the whitespace that precedes
  // the interpolation point so relative indentation is preserved.
  let text = "";
  for (let i = 0; i < interpolations.length; i++) {
    const literal = literals[i];
    const interpolation = String(interpolations[i]);
    const match = literal.match(/(?:^|[\r\n]+)([^\S\r\n]*)$/);
    if (match && match[1]) {
      text += literal + interpolation.replace(/([\r\n]+)(?=[^\r\n])/g, `$1${match[1]}`);
    } else {
      text += literal + interpolation;
    }
  }
  text += literals[literals.length - 1];

  // Step 2: find the common leading whitespace across non-empty lines and
  // strip it. Trim leading/trailing empty lines.
  const lines = text.split(/[\r\n]/g);
  let commonLeadingWhitespace: string | null = null;
  let firstLineIndex: number | null = null;
  let lastLineIndex: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const leadingWhitespace = lines[i].match(/^\s*/)![0];
    // Skip blank lines (whitespace-only).
    if (leadingWhitespace.length !== lines[i].length) {
      lastLineIndex = i;
      if (firstLineIndex == null) firstLineIndex = i;
      if (commonLeadingWhitespace == null || leadingWhitespace.length < commonLeadingWhitespace.length) {
        commonLeadingWhitespace = leadingWhitespace;
      }
    }
  }

  if (commonLeadingWhitespace == null) return text;
  return lines
    .slice(firstLineIndex!, lastLineIndex! + 1)
    .map((line) => line.slice(commonLeadingWhitespace!.length))
    .join("\n");
}
