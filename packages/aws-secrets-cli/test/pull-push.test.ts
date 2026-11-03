import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { runSecretsPush } from "../src/pull-push";

/** R5-08: a non-interactive push without --yes must fail, not no-op with exit 0. */
describe("R5-08: non-interactive push requires an explicit --yes", () => {
  let cwd: string;
  let originalIsTTY: boolean | undefined;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-secrets-push-"));
    originalIsTTY = process.stdin.isTTY;
    // Simulate CI: stdin is not attached to a terminal.
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  });

  after(async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("throws before touching AWS or .env", async () => {
    await assert.rejects(runSecretsPush({ cwd, dryRun: false }), /non-interactive mode without --yes/);
  });
});
