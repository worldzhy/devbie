#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { sendOnce } from "./send";
import { DEFAULT_CONFIG_PATH, DEFAULT_STATE_PATH, loadConfig, saveConfig } from "./config";
import type { WorklogConfig } from "./config";
import { upsertConfigFromProfile } from "./profile";
import type { WorklogProfile } from "./profile";
import { loadState, saveState } from "./state";
import { addWorkspace, removeWorkspace } from "./workspaces";
import { WorklogApi } from "./api";
import {
  SCHEDULER_INTERVAL_SECONDS,
  defaultSchedulerPaths,
  installSchedule,
  isScheduleInstalled,
  removeSchedule,
} from "./scheduler";

const USAGE = `worklog — reports your declared work to the team evaluation

Use:
  worklog send                 send everything not sent yet, then exit
  worklog start                start reporting: send now, then every ${SCHEDULER_INTERVAL_SECONDS / 60} minutes
  worklog stop                 stop reporting (what was already sent stays sent)
  worklog add <path>           declare a workspace — only declared paths are ever read
  worklog remove <path>        stop reporting a workspace
  worklog status               show what is declared, whether reporting is on, and what was sent
  worklog --profile <path>     apply the credentials file (install or rotate credentials)

First run:
  worklog --profile ~/Downloads/worklog-credentials.json
  worklog add ~/src/my-project
  worklog start`;

/**
 * `worklog` — the member-side worklog agent (ADR-027, ADR-028). Reporting is an
 * explicit switch: nothing is scheduled or sent until `start` (or a manual `send`).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }

  if (command === "add" || command === "remove") {
    const rawPath = args[1];
    if (!rawPath || args.length > 2) throw new Error(USAGE);
    const config = loadConfig();
    if (command === "add") {
      const result = addWorkspace(config, rawPath);
      saveConfig(config);
      const { workspace } = result;
      console.log(
        result.alreadyDeclared
          ? `Already declared: ${workspace.workspaceKey} (${workspace.rootPath})`
          : `Declared workspace "${workspace.workspaceKey}" → ${workspace.rootPath}`,
      );
      for (const entry of result.activity) {
        if (entry.sessions > 0) console.log(`  ${entry.ide}: ${entry.sessions} session(s) found`);
      }
      for (const warning of result.warnings) console.log(`warning: ${warning}`);
      if (!result.alreadyDeclared) console.log("It is reported on the next send.");
    } else {
      const removed = removeWorkspace(config, rawPath);
      saveConfig(config);
      console.log(
        `Removed workspace "${removed.workspaceKey}" (${removed.rootPath}) — the next send reports nothing more for it.`,
      );
    }
    return;
  }

  if (command === "status") {
    if (args.length > 1) throw new Error(USAGE);
    // Diagnostics must work before the first profile is applied, so a missing
    // config is reported rather than thrown.
    const config = loadConfigSafely();
    const state = loadState();
    const paths = defaultSchedulerPaths();
    const scheduled = isScheduleInstalled({ paths });
    console.log(`Config:   ${DEFAULT_CONFIG_PATH}`);
    console.log(`State:    ${DEFAULT_STATE_PATH}`);
    console.log(`Server:   ${config ? config.endpoint : "not configured — run: worklog --profile <path>"}`);
    console.log(
      `Reporting: ${scheduled ? `on (send every ${SCHEDULER_INTERVAL_SECONDS / 60} minutes)` : "off — run: worklog start"}`,
    );
    if (scheduled) console.log(`Log:      ${paths.logPath}`);
    console.log(`Last send: ${state.lastSentAt ?? "never"}`);
    if (state.lastError) console.log(`Last error: ${state.lastError}`);
    console.log("Workspaces (allowlist — only these are read):");
    for (const workspace of config?.workspaces ?? []) {
      console.log(`  - ${workspace.workspaceKey} ${workspace.rootPath}`);
    }
    if (!config || config.workspaces.length === 0) {
      console.log("  (none yet — declare one with: worklog add <path>)");
    }
    console.log(`Tracked session files: ${Object.keys(state.files).length}`);
    console.log(`Tracked documents:     ${Object.keys(state.documents).length}`);
    return;
  }

  const profileFlag = args.indexOf("--profile");
  if (profileFlag !== -1) {
    const profilePath = args[profileFlag + 1];
    if (!profilePath || args.length > 2) throw new Error(USAGE);
    const profile = JSON.parse(readFileSync(profilePath, "utf8")) as WorklogProfile;
    upsertConfigFromProfile(profile);
    console.log(`Configured from ${profilePath}.`);
    console.log('Next: declare your workspaces with "worklog add <path>", then run "worklog start".');
    return;
  }

  if (command === "send") {
    if (args.length > 1) throw new Error(USAGE);
    const summary = await send();
    console.log(
      `Workspaces ${summary.workspacesReported}, sessions ${summary.sessionsUploaded} (${summary.messagesUploaded} messages), documents ${summary.documentsUploaded}, skipped ${summary.skippedSessions}.`,
    );
    for (const note of summary.notes) console.log(`note: ${note}`);
    return;
  }

  if (command === "start") {
    if (args.length > 1) throw new Error(USAGE);
    const config = loadConfig();
    if (config.workspaces.length === 0) {
      console.log("warning: no workspace declared yet — nothing will be sent until: worklog add <path>");
    }
    // Send before scheduling: a bad token or unreachable server must fail here,
    // not silently every 15 minutes from launchd.
    const summary = await send();
    console.log(
      `Sent workspaces ${summary.workspacesReported}, sessions ${summary.sessionsUploaded} (${summary.messagesUploaded} messages), documents ${summary.documentsUploaded}.`,
    );
    const paths = defaultSchedulerPaths();
    installSchedule({ paths });
    console.log(
      `Reporting is on — a send runs every ${SCHEDULER_INTERVAL_SECONDS / 60} minutes, even after a reboot. Log: ${paths.logPath}`,
    );
    console.log("Stop it with: worklog stop");
    return;
  }

  if (command === "stop") {
    if (args.length > 1) throw new Error(USAGE);
    const paths = defaultSchedulerPaths();
    const wasScheduled = removeSchedule({ paths });
    console.log(
      wasScheduled
        ? 'Reporting is off — nothing is sent until you run "worklog start".'
        : 'Reporting was already off — nothing is sent until you run "worklog start".',
    );
    return;
  }

  console.error(USAGE);
  process.exit(1);
}

/** Config for diagnostics: null when the machine is not configured yet. */
function loadConfigSafely(): WorklogConfig | null {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

/** One send, with the outcome recorded so `status` can show it. */
async function send(): Promise<Awaited<ReturnType<typeof sendOnce>>> {
  const config = loadConfig();
  const state = loadState();
  const api = new WorklogApi(config.endpoint, config.token);
  try {
    const summary = await sendOnce(config, state, api);
    state.lastSentAt = new Date().toISOString();
    state.lastError = undefined;
    saveState(state);
    return summary;
  } catch (error) {
    // Persist progress read so far: a retry continues from the tail instead of
    // re-sending increments the server has already accepted.
    state.lastError = error instanceof Error ? error.message : String(error);
    saveState(state);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
