import { red } from "colorette";

import { CliError, isUserCancellation } from "@devbie/cli-kit";

/**
 * Wrap a CLI action with the standard error-handling protocol: user
 * cancellations exit cleanly, CliError prints a short red message, and any
 * other error prints its message (with stack under NEWBIE_DEBUG).
 *
 * Module CLI entries live outside the framework package and reuse this helper
 * to keep error behaviour identical to the built-in commands.
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
    if (process.env.NEWBIE_DEBUG && (error as Error).stack) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}
