/** Error type for expected CLI failures (missing files, invalid config, ...). */
export class CliError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/** Inquirer throws this when the user cancels a prompt (Esc / Ctrl-C). */
export function isUserCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "ExitPromptError"
  );
}
