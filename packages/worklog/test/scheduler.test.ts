import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  SCHEDULER_INTERVAL_SECONDS,
  SCHEDULER_LABEL,
  installSchedule,
  isScheduleInstalled,
  removeSchedule,
  renderScheduleFile,
} from "../src/scheduler";
import type { CommandResult, SchedulerPaths } from "../src/scheduler";

interface Call {
  command: string;
  args: string[];
}

function paths(overrides: Partial<SchedulerPaths> = {}): SchedulerPaths {
  const root = mkdtempSync(join(tmpdir(), "worklog-scheduler-"));
  return {
    platform: "darwin",
    plistPath: join(root, "LaunchAgents", `${SCHEDULER_LABEL}.plist`),
    logPath: join(root, ".devbie", "worklog.log"),
    nodePath: "/usr/local/bin/node",
    scriptPath: "/usr/local/lib/node_modules/@devbie/worklog/dist/cli.js",
    ...overrides,
  };
}

function recorder(results: CommandResult[] = []): {
  calls: Call[];
  run: (command: string, args: string[]) => CommandResult;
} {
  const calls: Call[] = [];
  return {
    calls,
    run: (command, args) => {
      calls.push({ command, args });
      return results.shift() ?? { status: 0, stderr: "" };
    },
  };
}

describe("renderScheduleFile", () => {
  it("schedules the send command with the absolute node and script paths", () => {
    const target = paths();

    const plist = renderScheduleFile(target);

    assert.match(plist, new RegExp(`<string>${SCHEDULER_LABEL}</string>`));
    assert.match(plist, /<string>\/usr\/local\/bin\/node<\/string>/);
    assert.match(plist, new RegExp(`<string>${target.scriptPath}</string>`));
    assert.match(plist, /<string>send<\/string>/);
    assert.match(plist, new RegExp(`<integer>${SCHEDULER_INTERVAL_SECONDS}</integer>`));
    assert.match(plist, new RegExp(`<string>${target.logPath}</string>`));
    // RunAtLoad would duplicate the send that `start` already ran.
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<false\/>/);
  });
});

describe("installSchedule", () => {
  it("writes the agent and reloads it under the user's launchd domain", () => {
    const target = paths();
    const { calls, run } = recorder();

    installSchedule({ paths: target, run });

    assert.ok(existsSync(target.plistPath));
    assert.deepEqual(calls[0].args[0], "bootout");
    assert.deepEqual(calls[1].args, ["bootstrap", `gui/${process.getuid?.()}`, target.plistPath]);
  });

  it("throws when launchd refuses the registration", () => {
    const target = paths();
    const { run } = recorder([
      { status: 0, stderr: "" },
      { status: 3, stderr: "Bootstrap failed: 5: Input/output error" },
    ]);

    assert.throws(() => installSchedule({ paths: target, run }), /launchctl bootstrap failed: Bootstrap failed/);
  });

  it("refuses to schedule on a platform without launchd", () => {
    const target = paths({ platform: "linux" });

    assert.throws(() => installSchedule({ paths: target, run: recorder().run }), /macOS only/);
    assert.equal(existsSync(target.plistPath), false);
  });
});

describe("removeSchedule", () => {
  it("unregisters and deletes the agent, reporting that it existed", () => {
    const target = paths();
    installSchedule({ paths: target, run: recorder().run });

    const { calls, run } = recorder();
    const removed = removeSchedule({ paths: target, run });

    assert.equal(removed, true);
    assert.equal(existsSync(target.plistPath), false);
    assert.deepEqual(calls[0].args[0], "bootout");
  });

  it("is idempotent: a second stop reports nothing was scheduled", () => {
    const target = paths();
    installSchedule({ paths: target, run: recorder().run });
    removeSchedule({ paths: target, run: recorder().run });

    assert.equal(removeSchedule({ paths: target, run: recorder().run }), false);
  });

  it("is tolerant on a platform without launchd", () => {
    assert.equal(removeSchedule({ paths: paths({ platform: "linux" }), run: recorder().run }), false);
  });
});

describe("isScheduleInstalled", () => {
  it("is false before anything is scheduled", () => {
    assert.equal(isScheduleInstalled({ paths: paths(), run: recorder().run }), false);
  });

  it("is true only when launchd still knows the job", () => {
    const target = paths();
    installSchedule({ paths: target, run: recorder().run });

    const registered = recorder([{ status: 0, stderr: "" }]);
    assert.equal(isScheduleInstalled({ paths: target, run: registered.run }), true);
    assert.deepEqual(registered.calls[0].args, ["print", `gui/${process.getuid?.()}/${SCHEDULER_LABEL}`]);

    const stale = recorder([{ status: 113, stderr: "Could not find service" }]);
    assert.equal(isScheduleInstalled({ paths: target, run: stale.run }), false);
  });
});

describe("schedule file content", () => {
  it("escapes XML metacharacters in paths", () => {
    const plist = renderScheduleFile(paths({ logPath: "/tmp/a&b<c>/worklog.log" }));

    assert.match(plist, /<string>\/tmp\/a&amp;b&lt;c&gt;\/worklog\.log<\/string>/);
  });

  it("is written verbatim to the plist path", () => {
    const target = paths();
    installSchedule({ paths: target, run: recorder().run });

    assert.equal(readFileSync(target.plistPath, "utf8"), renderScheduleFile(target));
  });
});
