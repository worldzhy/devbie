import { select } from "@inquirer/prompts";

/** Whether the process can prompt the user. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export interface ConfirmOptions {
  /** Skip the prompt (confirmed). */
  yes?: boolean;
  /** Dry runs and non-interactive runs never block on a prompt. */
  dryRun?: boolean;
}

/** Ask for confirmation; non-interactive and `--yes` runs proceed directly. */
export async function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (options.yes || options.dryRun || !isInteractive()) return true;
  const answer = await select({
    message,
    choices: [
      { name: "Yes", value: "yes" },
      { name: "No", value: "no" },
    ],
  });
  return answer === "yes";
}
