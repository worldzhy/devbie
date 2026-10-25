import { relative, resolve, sep } from "node:path";

import type { WorklogWorkspaceConfig } from "../config";

/** Path containment check that is robust against partial names. */
export function isInside(path: string, root: string): boolean {
  const absolutePath = resolve(path);
  const absoluteRoot = resolve(root);
  return absolutePath === absoluteRoot || absolutePath.startsWith(`${absoluteRoot}${sep}`);
}

/**
 * Both Claude and Trae name a per-workspace directory after the workspace
 * root path with "/" replaced by "-" (leading "-" kept) — e.g. `/Users/w/work`
 * → `-Users-w-work`. Trae additionally suffixes `--p2-<hash>`, which is not
 * invertible, so Trae matching is done by computing the prefix for each
 * declared workspace.
 */
export function dashedSlugFor(rootPath: string): string {
  return resolve(rootPath).split(sep).join("-");
}

/** Resolves which declared workspace a Trae memory file belongs to, if any. */
export function traeMemoryWorkspaceFor(
  filePath: string,
  traeMemoryDirectory: string,
  workspaces: WorklogWorkspaceConfig[],
): WorklogWorkspaceConfig | null {
  const slugDirectory = relative(traeMemoryDirectory, filePath).split(sep)[0];
  if (!slugDirectory) return null;
  for (const workspace of workspaces) {
    const prefix = dashedSlugFor(workspace.rootPath);
    if (slugDirectory === prefix || slugDirectory.startsWith(`${prefix}--p2-`)) return workspace;
  }
  return null;
}
