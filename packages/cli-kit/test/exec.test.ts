import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { execCapture, execLive, trim } from "../src/index";

const node = process.execPath;

describe("execCapture", () => {
  it("collects stdout and stderr of a successful command", async () => {
    const result = await execCapture(node, ["-e", "process.stdout.write('out'); process.stderr.write('err')"]);
    assert.deepEqual(result, { stdout: "out", stderr: "err" });
  });

  it("passes cwd and env without a shell", async () => {
    const result = await execCapture(
      node,
      ["-e", "process.stdout.write(`${process.cwd()}|${process.env.CLI_KIT_PROBE}`)"],
      { cwd: "/tmp", env: { ...process.env, CLI_KIT_PROBE: "probe" } },
    );
    assert.equal(result.stdout, "/tmp|probe");
  });

  it("rejects with the exit error and exposes stderr, including it in the message", async () => {
    await assert.rejects(
      () => execCapture(node, ["-e", "process.stderr.write('boom'); process.exit(2)"]),
      (error: Error & { stderr?: string }) => {
        assert.equal(error.stderr, "boom");
        assert.match(error.message, /boom/);
        return true;
      },
    );
  });

  it("does not treat arguments as shell syntax", async () => {
    const result = await execCapture(node, ["-e", "process.stdout.write(process.argv[1])", "$(id)"]);
    assert.equal(trim(result), "$(id)");
  });
});

describe("execLive", () => {
  it("resolves when the command exits with code 0", async () => {
    await execLive(node, ["-e", ""]);
  });

  it("rejects with the command and exit code when the command fails", async () => {
    await assert.rejects(() => execLive(node, ["-e", "process.exit(3)"]), /exited with code 3/);
  });
});
