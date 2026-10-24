import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { DEFAULT_AGENT_SESSION_DIRECTORIES, DEFAULT_CONFIG_PATH, loadConfig } from "./config";
import type { WorklogConfig, IdeKey } from "./config";

/**
 * The credentials file accepted by `worklog --profile`. Installation credentials
 * are issued only at creation or token rotation, so the file is assembled
 * client-side from `{ endpoint, token }`.
 */
export interface WorklogProfile {
  endpoint: string;
  token: string;
}

/**
 * Applies a credentials file to the local config. Credentials always come from
 * the file (rotating the installation token is how a rotated agent recovers);
 * everything the member already configured — workspaces, document directories,
 * session directories — is preserved.
 * On first run, IDE session directories are probed (only the ones that exist
 * on this machine are kept) and workspaces start empty — the member fills in
 * which of their workspaces are company ones before the first sync.
 */
export function upsertConfigFromProfile(profile: WorklogProfile, path = DEFAULT_CONFIG_PATH): void {
  if (!profile.endpoint || !profile.token) {
    throw new Error("Profile must define endpoint and token.");
  }
  const existing = existsSync(path) ? loadConfig(path) : null;
  const agentSessionDirectories: Partial<Record<IdeKey, string>> = {
    ...(existing?.agentSessionDirectories ?? {}),
  };
  for (const ide of Object.keys(DEFAULT_AGENT_SESSION_DIRECTORIES) as IdeKey[]) {
    const directory = DEFAULT_AGENT_SESSION_DIRECTORIES[ide];
    if (!agentSessionDirectories[ide] && existsSync(directory)) agentSessionDirectories[ide] = directory;
  }
  const config: WorklogConfig = {
    endpoint: profile.endpoint.replace(/\/$/, ""),
    token: profile.token,
    workspaces: existing?.workspaces ?? [],
    agentSessionDirectories,
    documentDirectories: existing?.documentDirectories ?? ["docs", ".trae/documents"],
    maxDocumentBytes: existing?.maxDocumentBytes ?? 200_000,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
}
