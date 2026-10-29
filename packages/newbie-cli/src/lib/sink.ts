import fs from "node:fs/promises";
import path from "node:path";

import { execLive } from "@devbie/cli-kit";

/** One planned change recorded by the sink in check mode. */
export interface SinkFinding {
  /** Project-relative path (or command label for `action` findings). */
  path: string;
  kind: "missing" | "differs" | "action";
  /** Human-readable description of an `action` finding. */
  detail?: string;
}

/**
 * Single write/exec boundary for every assemble step.
 * In dry-run mode no file is touched and no mutating command is executed;
 * the planned action is printed instead. In check mode nothing is written and
 * every planned change is recorded in `findings` for a CI gate to inspect.
 * Read operations bypass the sink.
 */
export interface Sink {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly check: boolean;
  readonly findings: SinkFinding[];
  writeText(file: string, content: string): Promise<void>;
  writeJson(file: string, value: unknown): Promise<void>;
  remove(fileOrDir: string): Promise<void>;
  copy(fromAbsolute: string, toRelative: string): Promise<void>;
  run(command: string, args: string[], label?: string): Promise<void>;
}

/** Read a project-relative file; null when absent or unreadable. */
async function readOrNull(absolutePath: string): Promise<string | null> {
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}

export function createSink(cwd: string, dryRun: boolean, options: { check?: boolean } = {}): Sink {
  const resolve = (file: string) => path.resolve(cwd, file);
  const check = Boolean(options.check);
  const findings: SinkFinding[] = [];

  const plan = (message: string): void => {
    console.info(`[dry-run] ${message}`);
  };

  const recordAction = (target: string, detail: string): void => {
    findings.push({ path: target, kind: "action", detail });
  };

  return {
    cwd,
    // Check mode never writes, so it also runs under dry-run reporting rules.
    dryRun: dryRun || check,
    check,
    findings,

    async writeText(file: string, content: string): Promise<void> {
      if (check) {
        const current = await readOrNull(resolve(file));
        if (current !== content) {
          findings.push({ path: file, kind: current === null ? "missing" : "differs" });
        }
        return;
      }
      if (dryRun) {
        plan(`write ${file} (${content.length} bytes)`);
        return;
      }
      const target = resolve(file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
    },

    async writeJson(file: string, value: unknown): Promise<void> {
      await this.writeText(file, `${JSON.stringify(value, null, 2)}\n`);
    },

    async remove(fileOrDir: string): Promise<void> {
      if (check) {
        try {
          await fs.stat(resolve(fileOrDir));
          recordAction(fileOrDir, `remove ${fileOrDir}`);
        } catch {
          // Already absent: nothing to check.
        }
        return;
      }
      if (dryRun) {
        plan(`remove ${fileOrDir}`);
        return;
      }
      await fs.rm(resolve(fileOrDir), { recursive: true, force: true });
    },

    async copy(fromAbsolute: string, toRelative: string): Promise<void> {
      if (check) {
        recordAction(toRelative, `copy ${path.basename(fromAbsolute)} -> ${toRelative}`);
        return;
      }
      if (dryRun) {
        plan(`copy ${path.basename(fromAbsolute)} -> ${toRelative}`);
        return;
      }
      const target = resolve(toRelative);
      const parent = path.dirname(target);
      await fs.mkdir(parent, { recursive: true });
      // Copy into a sibling temp dir first, then swap. A failed copy must never
      // leave the previously installed tree deleted or half-written.
      const stamp = `${process.pid}-${Date.now()}`;
      const temp = path.join(parent, `.${path.basename(target)}.tmp-${stamp}`);
      const backup = path.join(parent, `.${path.basename(target)}.bak-${stamp}`);
      await fs.rm(temp, { recursive: true, force: true });
      try {
        await fs.cp(fromAbsolute, temp, { recursive: true });
        const hadTarget = await fs.stat(target).then(
          () => true,
          () => false,
        );
        if (hadTarget) {
          await fs.rename(target, backup);
        }
        try {
          await fs.rename(temp, target);
        } catch (swapError) {
          if (hadTarget) {
            await fs.rename(backup, target);
          }
          throw swapError;
        }
        await fs.rm(backup, { recursive: true, force: true });
      } catch (error) {
        await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    },

    async run(command: string, args: string[], label?: string): Promise<void> {
      if (check) {
        recordAction(label ?? `${command} ${args.join(" ")}`.trim(), label ?? `${command} ${args.join(" ")}`.trim());
        return;
      }
      if (dryRun) {
        plan(`${command} ${args.join(" ")}`.trim());
        return;
      }
      await execLive(command, args, { cwd });
    },
  };
}
