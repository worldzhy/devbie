import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, parse, resolve } from "node:path";

import type { IdeKey, WorklogConfig, WorklogWorkspaceConfig } from "./config";
import { SESSION_SOURCES } from "./sessions/sources";
import { isInside } from "./sessions/workspace";

export interface WorkspaceActivity {
  ide: IdeKey;
  sessions: number;
}

export interface AddWorkspaceResult {
  workspace: WorklogWorkspaceConfig;
  alreadyDeclared: boolean;
  /** Session evidence found in each configured IDE store (zero counts included). */
  activity: WorkspaceActivity[];
  warnings: string[];
}

/**
 * Declares a workspace on the allowlist (ADR-027/ADR-030). Validation fails
 * fast while the member is present; sync never re-validates beyond skipping
 * paths that have since vanished from disk.
 */
export function addWorkspace(config: WorklogConfig, rawPath: string): AddWorkspaceResult {
  const rootPath = resolveWorkspacePath(rawPath);

  const existing = config.workspaces.find((workspace) => workspace.rootPath === rootPath);
  if (existing) {
    return { workspace: existing, alreadyDeclared: true, activity: countActivity(config, rootPath), warnings: [] };
  }
  for (const declared of config.workspaces) {
    if (isInside(rootPath, declared.rootPath) || isInside(declared.rootPath, rootPath)) {
      throw new Error(
        `${rootPath} nests with the already declared ${declared.rootPath} — nested workspaces would make session ownership ambiguous.`,
      );
    }
  }
  const workspaceKey = basename(rootPath);
  const keyCollision = config.workspaces.find((workspace) => workspace.workspaceKey === workspaceKey);
  if (keyCollision) {
    throw new Error(
      `"${workspaceKey}" is already used by ${keyCollision.rootPath} — rename one of the directories so each workspace has a distinct key.`,
    );
  }

  const workspace: WorklogWorkspaceConfig = { workspaceKey, rootPath };
  config.workspaces.push(workspace);

  const activity = countActivity(config, rootPath);
  const warnings: string[] = [];
  if (activity.every((entry) => entry.sessions === 0)) {
    warnings.push("No session activity for this path in any IDE store — double-check it is where you run your agents.");
  }
  return { workspace, alreadyDeclared: false, activity, warnings };
}

/** Removes a workspace from the allowlist. Purely local — the next sync simply reports nothing more for it. */
export function removeWorkspace(config: WorklogConfig, rawPath: string): WorklogWorkspaceConfig {
  // Tolerate paths that no longer exist on disk: resolve lexically as a fallback.
  let rootPath: string;
  try {
    rootPath = realpathSync(resolve(rawPath));
  } catch {
    rootPath = resolve(rawPath);
  }
  const index = config.workspaces.findIndex((workspace) => workspace.rootPath === rootPath);
  if (index === -1) {
    throw new Error(`Not declared: ${rootPath} — nothing to remove.`);
  }
  return config.workspaces.splice(index, 1)[0];
}

/** Path entry gate: exists, is a directory, symlink-resolved, and not absurdly broad. */
function resolveWorkspacePath(rawPath: string): string {
  let rootPath: string;
  try {
    rootPath = realpathSync(resolve(rawPath));
  } catch {
    throw new Error(`Path does not exist: ${rawPath}`);
  }
  if (!statSync(rootPath).isDirectory()) {
    throw new Error(`Not a directory: ${rootPath}`);
  }
  if (rootPath === parse(rootPath).root || rootPath === homedir()) {
    throw new Error(`Refusing to declare ${rootPath} — that would put your entire machine on the allowlist.`);
  }
  return rootPath;
}

/** Per-IDE session evidence for the path, from the IDE stores actually configured on this machine. */
function countActivity(config: WorklogConfig, rootPath: string): WorkspaceActivity[] {
  const activity: WorkspaceActivity[] = [];
  for (const ide of Object.keys(SESSION_SOURCES) as IdeKey[]) {
    const directory = config.agentSessionDirectories[ide];
    if (!directory) continue;
    activity.push({ ide, sessions: SESSION_SOURCES[ide].countSessions(directory, rootPath) });
  }
  return activity;
}
