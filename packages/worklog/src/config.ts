import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface WorklogWorkspaceConfig {
  /** Stable identifier the server stores (derived from the directory name). */
  workspaceKey: string;
  /** Absolute, symlink-resolved path of the workspace root. */
  rootPath: string;
}

/**
 * IDE identity: both the key of `agentSessionDirectories` and the key of the
 * session source registry. The wire provenance may differ per IDE (Trae only
 * exposes IDE-written summaries, reported as "trae-memory").
 */
export type IdeKey = "claude" | "codex" | "trae";

export interface WorklogConfig {
  endpoint: string;
  token: string;
  /**
   * The allowlist (ADR-030): only workspaces declared here are ever scanned
   * or uploaded. There is no company/personal split — a path that is not
   * declared is personal by construction and never touched.
   */
  workspaces: WorklogWorkspaceConfig[];
  /**
   * Where each IDE keeps its agent session records, keyed by IDE and scanned
   * recursively. Only sessions whose recorded working directory is inside a
   * declared workspace are uploaded. `trae` points at Trae's memory store
   * (~/.trae-cn/memory/projects) — those sessions are the IDE's own summaries,
   * uploaded with source "trae-memory".
   */
  agentSessionDirectories: Partial<Record<IdeKey, string>>;
  /** Directories inside declared workspaces whose markdown files count as declared work. */
  documentDirectories: string[];
  maxDocumentBytes: number;
}

export const DEFAULT_CONFIG_PATH = join(homedir(), ".devbie", "worklog.json");
export const DEFAULT_STATE_PATH = join(homedir(), ".devbie", "worklog-state.json");

/** Default agent session directories per IDE, probed for existence when a profile is applied. */
export const DEFAULT_AGENT_SESSION_DIRECTORIES: Record<IdeKey, string> = {
  claude: join(homedir(), ".claude", "projects"),
  codex: join(homedir(), ".codex", "sessions"),
  trae: join(homedir(), ".trae-cn", "memory", "projects"),
};

export function loadConfig(path = DEFAULT_CONFIG_PATH): WorklogConfig {
  if (!existsSync(path)) {
    throw new Error(`Worklog config not found at ${path}. Run "worklog --profile <path>" with the credentials file.`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WorklogConfig>;
  const config: WorklogConfig = {
    endpoint: (parsed.endpoint ?? "").replace(/\/$/, ""),
    token: parsed.token ?? "",
    workspaces: parsed.workspaces ?? [],
    agentSessionDirectories: parsed.agentSessionDirectories ?? {},
    documentDirectories: parsed.documentDirectories ?? [],
    maxDocumentBytes: parsed.maxDocumentBytes ?? 200_000,
  };
  if (!config.endpoint || !config.token) {
    throw new Error("Worklog config must define endpoint and token.");
  }
  return config;
}

/** Persists the config with owner-only permissions — it carries the bearer token. */
export function saveConfig(config: WorklogConfig, path = DEFAULT_CONFIG_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
}
