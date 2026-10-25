import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { fileExists, pathExists, readTextIfExists } from "../src/index";

let workspace: string;

before(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "cli-kit-"));
  await fs.writeFile(path.join(workspace, "present.txt"), "content", "utf8");
});

after(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("pathExists", () => {
  it("returns true for an existing path and false for a missing one", async () => {
    assert.equal(await pathExists(path.join(workspace, "present.txt")), true);
    assert.equal(await pathExists(path.join(workspace, "missing.txt")), false);
  });
});

describe("fileExists", () => {
  it("resolves relative paths against cwd and never throws", async () => {
    assert.equal(await fileExists(workspace, "present.txt"), true);
    assert.equal(await fileExists(workspace, "nested/missing.txt"), false);
  });
});

describe("readTextIfExists", () => {
  it("reads a file and returns null when it is absent", async () => {
    assert.equal(await readTextIfExists(path.join(workspace, "present.txt")), "content");
    assert.equal(await readTextIfExists(path.join(workspace, "missing.txt")), null);
  });

  it("returns null when the path is a directory", async () => {
    assert.equal(await readTextIfExists(workspace), null);
  });
});
