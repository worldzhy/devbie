import { red } from "colorette";

import { CliError, isUserCancellation } from "./errors";

/** Environment variable that turns on stack traces for unexpected errors. */
export const DEBUG_ENV = "DEBBIE_DEBUG";

/**
 * Run a CLI action with the shared error protocol (ADR-024 sibling rule):
 * user cancellations exit 0 quietly, `CliError` prints its message, and any
 * other error prints its message plus a stack under `DEBBIE_DEBUG`.
 *
 * Every `@devbie` CLI entry point uses this helper, so the two CLIs and the
 * module CLI plugins report failures the same way instead of each keeping its
 * own catch block.
 */
export async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (isUserCancellation(error)) {
      console.info("\nOperation cancelled\n");
      process.exit(0);
    }
    if (error instanceof CliError) {
      console.error(red(`\n${error.message}\n`));
      process.exit(1);
    }
    console.error(red(`\n${(error as Error).message}\n`));
    if (process.env[DEBUG_ENV] && (error as Error).stack) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}
