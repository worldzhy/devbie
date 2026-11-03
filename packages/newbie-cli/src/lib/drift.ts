import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CONSUMER_MODULES_DIR, REGISTRY_MODULES_DIR } from "../constants/paths";
import { FileSnapshot } from "../core/drift";
import { RegistryLocation } from "./registry";

/** OS metadata files must never participate in drift detection. */
const IGNORED_FILES = new Set([".DS_Store"]);

/**
 * Read a file with a tiny retry window. Container overlay filesystems can
 * briefly reject freshly extracted files with ENOENT when read immediately
 * after extraction; a couple of retries absorb that jitter.
 */
async function readStable(file: string): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || attempt === 2) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function hashFile(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  hash.update(await readStable(file));
  return hash.digest("hex");
}

/** Walk a directory and hash every file; keys are POSIX-relative paths. */
export async function snapshotDirectory(root: string): Promise<FileSnapshot> {
  const entries = new Map<string, string>();

  async function walk(dir: string, prefix: string): Promise<void> {
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (IGNORED_FILES.has(dirent.name)) continue;
      const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      const absolute = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(absolute, relative);
      } else if (dirent.isFile()) {
        entries.set(relative, await hashFile(absolute));
      }
    }
  }

  await walk(root, "");
  return entries;
}

/**
 * Snapshot a module directory inside the consuming project.
 * Returns null when the directory does not exist — callers should treat
 * that as "module not installed" rather than diffing against an empty
 * pristine tree. An empty directory (legitimately zero files) still returns
 * an empty snapshot Map.
 */
export async function snapshotInstalledModule(cwd: string, key: string): Promise<FileSnapshot | null> {
  const dir = path.resolve(cwd, CONSUMER_MODULES_DIR, key);
  try {
    await fs.access(dir);
  } catch {
    return null;
  }
  return snapshotDirectory(dir);
}

/**
 * Extract one registry subtree at `sourceCommit` into `dest` using
 * `git archive | tar -x`. Streaming an archive avoids creating a throwaway
 * git worktree (no admin metadata, no `worktree prune`, and no checkout
 * rename/unlink churn that raced badly on overlay filesystems).
 *
 * Returns false when the pinned commit does not exist locally. A commit that
 * exists but does not contain the module extracts nothing; callers detect
 * that via the missing target directory.
 */
function extractArchive(registryRoot: string, sourceCommit: string, subpath: string, dest: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const git = spawn("git", ["-C", registryRoot, "archive", sourceCommit, "--", subpath]);
    const tar = spawn("tar", ["-x", "-C", dest]);
    git.stdout.pipe(tar.stdin);

    // Collect child stderr for actionable failure messages.
    // gitErr is drained but never read: git failures resolve(false) via the
    // exit code, while tar failures surface tarErr in the rejection message.
    let _gitErr = "";
    let tarErr = "";
    git.stderr.on("data", (chunk) => {
      _gitErr += chunk.toString();
    });
    tar.stderr.on("data", (chunk) => {
      tarErr += chunk.toString();
    });

    let gitCode: number | null = null;
    let tarCode: number | null = null;
    let settled = false;
    const finish = () => {
      if (settled || gitCode === null || tarCode === null) return;
      settled = true;
      if (gitCode !== 0) {
        // git failed (e.g. missing commit): it produced no archive, so a
        // tar "not a tar archive" failure here is expected, not fatal.
        resolve(false);
      } else if (tarCode !== 0) {
        reject(new Error(`tar extraction failed with code ${tarCode}: ${tarErr.trim() || "no stderr output"}`));
      } else {
        resolve(true);
      }
    };
    git.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    tar.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    git.on("close", (code) => {
      gitCode = code;
      finish();
    });
    tar.on("close", (code) => {
      tarCode = code;
      finish();
    });
  });
}

/**
 * Snapshot the pristine registry copy of a module at `sourceCommit`.
 * Returns null when the pinned commit (or the module at that commit) is not
 * available in the local registry clone.
 */
export async function snapshotPristineModule(
  registry: RegistryLocation,
  key: string,
  sourceCommit: string,
): Promise<FileSnapshot | null> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `newbie-pristine-${key}-`));
  try {
    const subpath = `${REGISTRY_MODULES_DIR}/${key}`;
    const archived = await extractArchive(registry.root, sourceCommit, subpath, tmp);
    if (!archived) return null;
    const moduleDir = path.join(tmp, ...REGISTRY_MODULES_DIR.split("/"), key);
    // The commit exists but predates this module: nothing to compare against.
    try {
      await fs.access(moduleDir);
    } catch {
      return null;
    }
    // The explicit await is required: with a bare `return promise` the
    // finally block runs as soon as the body yields the promise (before the
    // snapshot settles), which would wipe the temp dir mid-walk.
    return await snapshotDirectory(moduleDir);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
