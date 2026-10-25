import { cyan, yellow } from "colorette";

import { CliError } from "@devbie/cli-kit";
import { Sink } from "./sink";

/**
 * Collects recoverable per-module problems (missing settings file, unknown
 * module name, ...). Steps keep going — matching legacy resilience — but the
 * command exits non-zero at the end when any issue was collected, instead of
 * the legacy behaviour of printing errors and exiting 0.
 */
export class IssueBag {
  private readonly items: string[] = [];

  warn(message: string): void {
    console.warn(yellow(`[warn] ${message}`));
    this.items.push(message);
  }

  get count(): number {
    return this.items.length;
  }

  assertEmpty(): void {
    if (this.items.length > 0) {
      throw new CliError(`Completed with ${this.items.length} warning(s); see above.`);
    }
  }
}

/**
 * Report a recoverable problem. In dry-run mode missing settings/schemas are
 * expected (repositories were never cloned), so they are printed as skipped
 * notes instead of counting as failures.
 */
export function reportIssue(issues: IssueBag, sink: Sink, message: string): void {
  if (sink.dryRun) {
    console.info(cyan(`[dry-run] skip: ${message}`));
  } else {
    issues.warn(message);
  }
}
