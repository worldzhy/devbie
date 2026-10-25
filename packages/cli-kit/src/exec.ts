import { execFile, spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Argument-based process execution. NEVER pass interpolated shell strings here:
 * every argument goes through execFile/spawn without a shell, which removes
 * the command-injection class of bugs that string-built commands had (e.g.
 * `npm install ${userControlledString}`).
 */
export function execCapture(command: string, args: string[] = [], options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, env: options.env, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const collected = stderr?.toString() ?? "";
          (error as Error & { stderr?: string }).stderr = collected;
          // execFile truncates captured stderr in its message; append the full
          // text so callers that only print error.message still see the cause.
          if (collected.trim() && !error.message.includes(collected.trim())) {
            error.message = `${error.message.trimEnd()}\n${collected.trim()}`;
          }
          reject(error);
          return;
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      },
    );
  });
}

/** Run with inherited stdio so long operations (npm install, git clone) stay visible. */
export function execLive(command: string, args: string[] = [], options: ExecOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`[Error] ${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

/** Trimmed stdout of a captured execution, for single-value commands. */
export function trim(result: ExecResult): string {
  return result.stdout.trim();
}
