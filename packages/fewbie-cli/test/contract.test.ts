import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { parseModuleContract, validateManifestContract } from "../src/registry/contract";
import { loadModule } from "../src/registry/store";
import { REGISTRY_MANIFEST_FILE } from "../src/registry/types";

const VALID = {
  version: "1.0.0",
  framework: "^1.7.0",
  entry: "src/fewbie/modules/fixture/features/fixture/index.ts",
  labels: ["title", "description"],
  ports: ["save"],
  ui: ["button", "card"],
  states: ["ready", "error"],
};

async function writeModule(contract: unknown): Promise<{ root: string; name: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-contract-"));
  const name = "fixture";
  // Authored payload sits at the install target minus the install root (ADR-071).
  const storage = (target: string): string => target.slice(`src/fewbie/modules/${name}/`.length);
  await fs.mkdir(path.join(root, name, path.dirname(storage(VALID.entry))), { recursive: true });
  await fs.writeFile(path.join(root, name, storage(VALID.entry)), "export {};\n");
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

test("rejects an entry that is not one of the module files", () => {
  const manifest = { name: "fixture", files: ["other.ts"], contract: VALID };
  assert.throws(() => validateManifestContract(manifest), /must be one of the module's files/);
});

test("loadModule warns and still loads a module without a contract", async () => {
  const { root, name } = await writeModule(undefined);
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message: string) => warnings.push(message);
  try {
    const loaded = await loadModule(root, name);
    assert.equal(loaded.manifest.contract, undefined);
    assert.equal(loaded.manifest.name, name);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /has no contract/);
  } finally {
    console.warn = original;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("loadModule validates a contract that ships with the module", async () => {
  const { root, name } = await writeModule({ ...VALID, entry: "src/fewbie/modules/fixture/features/other/index.ts" });
  try {
    await assert.rejects(loadModule(root, name), /must be one of the module's files/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const LAYERED = {
  ...VALID,
  version: "2.0.0",
  labels: ["title", "description"],
  ports: ["save"],
  states: ["ready"],
  layers: [
    {
      layer: "features",
      types: "src/fewbie/modules/fixture/features/fixture/types.ts",
      labels: ["title"],
      ports: ["save"],
      states: ["ready"],
    },
    {
      layer: "components",
      types: "src/fewbie/modules/fixture/components/shared/types.ts",
      labels: ["description"],
      ports: [],
      states: [],
    },
  ],
};

const LAYERED_FILES = [
  VALID.entry,
  "src/fewbie/modules/fixture/features/fixture/types.ts",
  "src/fewbie/modules/fixture/components/shared/types.ts",
];

test("accepts a block whose top-level lists are the layer union (ADR-069)", () => {
  const parsed = parseModuleContract(LAYERED, "fixture");
  assert.deepEqual(
    parsed.layers?.map((layer) => layer.layer),
    ["features", "components"],
  );
  assert.deepEqual(parsed.labels, ["title", "description"]);
  validateManifestContract({ name: "fixture", files: LAYERED_FILES, contract: LAYERED });
});

test("rejects layers on a 1.x contract", () => {
  assert.throws(() => parseModuleContract({ ...LAYERED, version: "1.4.0" }, "fixture"), /require contract version 2/);
});

test("rejects a key declared by two layers", () => {
  const duplicated = {
    ...LAYERED,
    layers: [LAYERED.layers[0], { ...LAYERED.layers[1], labels: ["title"] }],
  };
  assert.throws(() => parseModuleContract(duplicated, "fixture"), /declared by more than one layer/);
});

test("rejects a layer types file outside its own layer", () => {
  const misplaced = {
    ...LAYERED,
    layers: [
      { ...LAYERED.layers[0], types: "src/fewbie/modules/fixture/components/fixture/types.ts" },
      LAYERED.layers[1],
    ],
  };
  assert.throws(
    () => parseModuleContract(misplaced, "fixture"),
    /must land under src\/fewbie\/modules\/fixture\/features\//,
  );
});

test("rejects a top-level list that drifts from the layer union", () => {
  assert.throws(
    () => parseModuleContract({ ...LAYERED, ports: ["save", "cancel"] }, "fixture"),
    /ports lists cancel that no layer declares/,
  );
});

test("rejects a layer types file outside the module files", () => {
  const manifest = { name: "fixture", files: [VALID.entry], contract: LAYERED };
  assert.throws(
    () => validateManifestContract(manifest),
    /layers\.features\.types .* must be one of the module's files/,
  );
});
