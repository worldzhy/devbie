/**
 * Client-side redaction (ADR-029 §8): credentials and other people's data never
 * leave the member's machine. This is a best-effort scrubber, not a guarantee —
 * worklog reports what it scanned so the operator can tighten patterns.
 */
const PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "github-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  {
    name: "assigned-secret",
    pattern: /\b(password|passwd|secret|token|api[_-]?key)\b\s*[:=]\s*["']?[^\s"',}]{6,}/gi,
  },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

export const REDACTED = "[REDACTED]";

export function redact(text: string): string {
  let output = text;
  for (const { pattern } of PATTERNS) {
    output = output.replace(pattern, (match) => {
      // Keep the key name for the "assigned-secret" case so the reader knows
      // what was removed; everything else is replaced wholesale.
      if (pattern.source.includes("password|passwd|secret|token")) {
        const separator = match.search(/[:=]/);
        return separator > 0 ? `${match.slice(0, separator).trim()}=${REDACTED}` : REDACTED;
      }
      return REDACTED;
    });
  }
  return output;
}
