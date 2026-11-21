import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { parseModuleContract, validateManifestContract } from "../src/registry/contract";
import { loadItem } from "../src/registry/store";
import { REGISTRY_MANIFEST_FILE } from "../src/registry/types";

const VALID = {
  version: "1.0.0",
  framework: "^1.7.0",
  entry: "src/features/fixture/index.ts",
  labels: ["title", "description"],
  ports: ["save"],
  ui: ["button", "card"],
  states: ["ready", "error"],
};

async function writeItem(contract: unknown): Promise<{ root: string; name: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-contract-"));
  const name = "fixture";
  await fs.mkdir(path.join(root, name, "src/features/fixture"), { recursive: true });
  await fs.writeFile(path.join(root, name, VALID.entry), "export {};\n");
  await fs.writeFile(
    path.join(root, name, REGISTRY_MANIFEST_FILE),
    JSON.stringify({
      name,
      type: "registry:block",
      title: "Fixture",
      files: [VALID.entry],
      ...(contract === undefined ? {} : { contract }),
    }),
  );
  return { root, name };
}

test("accepts a complete contract", () => {
  const parsed = parseModuleContract(VALID, "fixture");
  assert.deepEqual(parsed.labels, ["title", "description"]);
  assert.deepEqual(parsed.states, ["ready", "error"]);
});

test("rejects an invalid version", () => {
  assert.throws(() => parseModuleContract({ ...VALID, version: "1.0" }, "fixture"), /valid semver version/);
});

test("rejects an unparsable framework range", () => {
  assert.throws(() => parseModuleContract({ ...VALID, framework: "not a range" }, "fixture"), /valid semver range/);
});

test("rejects duplicate labels", () => {
  assert.throws(() => parseModuleContract({ ...VALID, labels: ["title", "title"] }, "fixture"), /duplicate 'title'/);
});

test("rejects an empty label list", () => {
  assert.throws(() => parseModuleContract({ ...VALID, labels: [] }, "fixture"), /labels must be a non-empty array/);
});

test("accepts a presentational contract with no ports and no ui primitives", () => {
  const parsed = parseModuleContract({ ...VALID, ports: [], ui: [] }, "fixture");
  assert.deepEqual(parsed.ports, []);
  assert.deepEqual(parsed.ui, []);
});

test("rejects a port that is not a method name", () => {
  assert.throws(() => parseModuleContract({ ...VALID, ports: ["save-all"] }, "fixture"), /not a valid method name/);
});

test("rejects a ui atom outside the shadcn allowlist", () => {
  assert.throws(() => parseModuleContract({ ...VALID, ui: ["button", "widget"] }, "fixture"), /not an allowed shadcn/);
});

test("rejects an unknown state", () => {
  assert.throws(() => parseModuleContract({ ...VALID, states: ["idle"] }, "fixture"), /must be one of/);
});

test("rejects an entry that is not one of the item files", () => {
  const manifest = { name: "fixture", files: ["other.ts"], contract: VALID };
  assert.throws(() => validateManifestContract(manifest), /must be one of the item's files/);
});

test("loadItem warns and still loads an item without a contract", async () => {
  const { root, name } = await writeItem(undefined);
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message: string) => warnings.push(message);
  try {
    const loaded = await loadItem(root, name);
    assert.equal(loaded.manifest.contract, undefined);
    assert.equal(loaded.manifest.name, name);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /has no contract/);
  } finally {
    console.warn = original;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("loadItem validates a contract that ships with the item", async () => {
  const { root, name } = await writeItem({ ...VALID, entry: "src/features/other/index.ts" });
  try {
    await assert.rejects(loadItem(root, name), /must be one of the item's files/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
