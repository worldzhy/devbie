import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { after, describe, it } from "node:test";

import { createSink } from "../src/lib/sink";

const require = createRequire(import.meta.url);
const prettierBin = require.resolve("prettier/bin/prettier.cjs");

const roots: string[] = [];

/** A consumer tree whose `node_modules/.bin` exposes the real prettier binary. */
async function makeConsumer(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-json-"));
  roots.push(root);
  const bin = path.join(root, "node_modules", ".bin");
  await fs.mkdir(bin, { recursive: true });
  // `npx prettier` resolves from the consumer's node_modules, so the test links
  // the installed binary instead of fetching one from the registry.
  await fs.symlink(prettierBin, path.join(bin, "prettier"));
  return root;
}

after(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("sink.writeJson", () => {
  it("keeps a short dependencies array on one line via the consumer's prettier", async () => {
    const root = await makeConsumer();
    const sink = createSink(root, false);
    await sink.writeJson("newbie-modules.json", {
      version: 1,
      modules: [{ key: "xlsx", dependencies: ["xlsx"], devDependencies: [] }],
    });
    const content = await fs.readFile(path.join(root, "newbie-modules.json"), "utf8");
    assert.match(content, /"dependencies": \["xlsx"\],/);
  });
});
