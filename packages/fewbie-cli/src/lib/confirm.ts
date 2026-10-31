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

/**
 * Ask for confirmation. Mutations must be explicit: a non-interactive session
 * (CI, pipes, sandboxes) declines unless `--yes` was passed, because inquirer
 * cannot prompt there and silently proceeding would apply unrequested writes.
 */
export async function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (options.yes || options.dryRun) return true;
  if (!isInteractive()) {
    console.info("[info] Non-interactive session: pass --yes to confirm.");
    return false;
  }
  const answer = await select({
    message,
    choices: [
      { name: "Yes", value: "yes" },
      { name: "No", value: "no" },
    ],
  });
  return answer === "yes";
}
