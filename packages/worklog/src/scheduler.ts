import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Reverse-DNS label, so the agent is unambiguous next to third-party login items. */
export const SCHEDULER_LABEL = "com.devbie.worklog";
/** Fixed cadence: a send is an incremental batch, so 15 minutes loses nothing. */
export const SCHEDULER_INTERVAL_SECONDS = 15 * 60;

export interface SchedulerPaths {
  platform: NodeJS.Platform;
  /** launchd user agent definition. */
  plistPath: string;
  /** Where launchd writes the scheduled run's output. */
  logPath: string;
  /** Absolute node binary — launchd starts jobs with a minimal PATH. */
  nodePath: string;
  /** Absolute path of the CLI entry script. */
  scriptPath: string;
}

export interface CommandResult {
  status: number | null;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => CommandResult;

export interface SchedulerOptions {
  paths: SchedulerPaths;
  /** Defaults to real launchctl; tests inject a fake so no agent is installed. */
  run?: CommandRunner;
}

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return { status: result.status, stderr: result.stderr ?? "" };
}

export function isSchedulerSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "darwin";
}

/** Real-machine paths, computed at call time so tests can supply their own. */
export function defaultSchedulerPaths(): SchedulerPaths {
  const scriptPath = process.argv[1];
  if (!scriptPath) throw new Error("Cannot locate the worklog CLI script to schedule.");
  return {
    platform: process.platform,
    plistPath: join(homedir(), "Library", "LaunchAgents", `${SCHEDULER_LABEL}.plist`),
    logPath: join(homedir(), ".devbie", "worklog.log"),
    nodePath: process.execPath,
    scriptPath: realpathSync(scriptPath),
  };
}

export function renderScheduleFile(paths: SchedulerPaths): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SCHEDULER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(paths.nodePath)}</string>
    <string>${escapeXml(paths.scriptPath)}</string>
    <string>send</string>
  </array>
  <key>StartInterval</key>
  <integer>${SCHEDULER_INTERVAL_SECONDS}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${escapeXml(paths.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(paths.logPath)}</string>
</dict>
</plist>
`;
}

/**
 * Registers the periodic send with launchd. Reloading (bootout then bootstrap)
 * keeps this idempotent: a second `start` refreshes the job instead of piling
 * up a duplicate registration.
 */
export function installSchedule({ paths, run = runCommand }: SchedulerOptions): void {
  assertSupported(paths.platform);
  mkdirSync(dirname(paths.plistPath), { recursive: true });
  mkdirSync(dirname(paths.logPath), { recursive: true });
  writeFileSync(paths.plistPath, renderScheduleFile(paths), "utf8");
  run("launchctl", ["bootout", launchdTarget()]);
  const bootstrap = run("launchctl", ["bootstrap", `gui/${userId()}`, paths.plistPath]);
  if (bootstrap.status !== 0) {
    throw new Error(`launchctl bootstrap failed: ${bootstrap.stderr.trim() || `exit ${bootstrap.status}`}`);
  }
}

/**
 * Unregisters the periodic send. Returns whether a registration existed, so
 * `stop` can report "already off" instead of pretending it did something.
 * Tolerant on non-macOS: nothing could have been scheduled there.
 */
export function removeSchedule({ paths, run = runCommand }: SchedulerOptions): boolean {
  if (!isSchedulerSupported(paths.platform)) return false;
  const existed = existsSync(paths.plistPath);
  if (existed) run("launchctl", ["bootout", launchdTarget()]);
  rmSync(paths.plistPath, { force: true });
  return existed;
}

export function isScheduleInstalled({ paths, run = runCommand }: SchedulerOptions): boolean {
  if (!isSchedulerSupported(paths.platform)) return false;
  if (!existsSync(paths.plistPath)) return false;
  return run("launchctl", ["print", launchdTarget()]).status === 0;
}

function assertSupported(platform: NodeJS.Platform): void {
  if (isSchedulerSupported(platform)) return;
  throw new Error(
    `Reporting is scheduled with launchd, which exists on macOS only — this machine runs ${platform}. ` +
      "Run the send command from your own scheduler instead.",
  );
}

function launchdTarget(): string {
  return `gui/${userId()}/${SCHEDULER_LABEL}`;
}

function userId(): number {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("Cannot resolve the user id required for launchd.");
  return uid;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
