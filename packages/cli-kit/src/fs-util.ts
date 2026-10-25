import fs from "node:fs/promises";
import path from "node:path";

/** Promise-based existence check for a path (absolute or relative to cwd) that never throws. */
export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** Promise-based existence check for a path resolved against `cwd` that never throws. */
export async function fileExists(cwd: string, relativePath: string): Promise<boolean> {
  return pathExists(path.resolve(cwd, relativePath));
}

/** Read a UTF-8 file, returning null when it is absent or unreadable. */
export async function readTextIfExists(absolutePath: string): Promise<string | null> {
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}
