import { CliError } from "@devbie/cli-kit";

/** Whether the process can prompt the user. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Refuse to guess in a non-interactive session. Inquirer's prompts throw on a
 * closed stdin, so mutation commands must either run with `--yes` or stop with
 * an actionable message instead of crashing mid-way.
 */
export function assertInteractive(action: string): void {
  if (isInteractive()) return;
  throw new CliError(`Non-interactive session: pass --yes to ${action}.`);
}
