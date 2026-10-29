import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createSink } from "../src/lib/sink";

async function makeTree(): Promise<{ root: string; source: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-sink-"));
  const source = path.join(root, "registry-source");
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, "file.txt"), "new content", "utf8");
  return { root, source };
}

describe("sink.copy", () => {
  it("replaces an existing target with the new content", async () => {
    const { root, source } = await makeTree();
    const sink = createSink(root, false);
    await sink.writeText("modules/demo/old.txt", "old content");
    await sink.copy(source, "modules/demo");
    assert.equal(await fs.readFile(path.join(root, "modules/demo/file.txt"), "utf8"), "new content");
    await assert.rejects(fs.stat(path.join(root, "modules/demo/old.txt")));
  });

  it("creates the target tree when nothing was installed before", async () => {
    const { root, source } = await makeTree();
    const sink = createSink(root, false);
    await sink.copy(source, "modules/fresh");
    assert.equal(await fs.readFile(path.join(root, "modules/fresh/file.txt"), "utf8"), "new content");
  });

  it("keeps the previous tree intact when the copy fails", async () => {
    const { root, source } = await makeTree();
    const sink = createSink(root, false);
    await sink.writeText("modules/demo/old.txt", "old content");
    // A source path that vanishes before the copy starts forces fs.cp to fail.
    const vanished = path.join(source, "does-not-exist");
    await assert.rejects(sink.copy(vanished, "modules/demo"));
    assert.equal(await fs.readFile(path.join(root, "modules/demo/old.txt"), "utf8"), "old content");
    // No temp or backup litter is left behind.
    const leftovers = (await fs.readdir(path.join(root, "modules"))).filter((name) => name !== "demo");
    assert.deepEqual(leftovers, []);
  });

  it("does not touch the filesystem in dry-run or check mode", async () => {
    const { root, source } = await makeTree();
    await createSink(root, true).copy(source, "modules/demo");
    await assert.rejects(fs.stat(path.join(root, "modules/demo")));
    const checking = createSink(root, false, { check: true });
    await checking.copy(source, "modules/demo");
    await assert.rejects(fs.stat(path.join(root, "modules/demo")));
    assert.equal(checking.findings.length, 1);
  });
});
