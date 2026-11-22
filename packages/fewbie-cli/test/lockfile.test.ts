import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { applyModuleSelection } from "../src/commands/modules/apply";
import { runUpdate } from "../src/commands/modules/update";
import { hashContent } from "../src/lib/hashes";
import { readLockfile } from "../src/lib/lockfile";
import { REGISTRY_MANIFEST_FILE } from "../src/registry/types";

const TARGET = "src/features/fixture/index.ts";
const ORIGINAL = "export const fixture = 1;\n";

interface Fixture {
  root: string;
  registry: string;
  project: string;
  target: string;
}

async function setup(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-lock-"));
  const registry = path.join(root, "registry");
  const project = path.join(root, "project");
  const item = path.join(registry, "fixture");

  await fs.mkdir(path.join(item, "src/features/fixture"), { recursive: true });
  await fs.writeFile(
    path.join(item, REGISTRY_MANIFEST_FILE),
    JSON.stringify({
      name: "fixture",
      type: "registry:feature",
      title: "Fixture",
      files: [TARGET],
      contract: {
        version: "1.2.3",
        framework: "^1.9.0",
        entry: TARGET,
        labels: ["title"],
        ports: ["save"],
        ui: ["button"],
        states: ["ready"],
      },
    }),
  );
  await fs.writeFile(path.join(item, TARGET), ORIGINAL);

  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, "package.json"), "{}\n");
  await fs.writeFile(path.join(project, "fewbie.json"), `${JSON.stringify({ modules: ["fixture"] }, null, 2)}\n`);

  process.env.FEWBIE_REGISTRY_PATH = registry;
  return { root, registry, project, target: path.join(project, TARGET) };
}

/** Capture stdout/stdout noise while running a command. */
async function quiet<T>(run: () => Promise<T>): Promise<{ result: T; output: string }> {
  const lines: string[] = [];
  const info = console.info;
  const write = process.stdout.write.bind(process.stdout);
  console.info = (message?: unknown) => lines.push(String(message));
  process.stdout.write = ((chunk: string) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    const result = await run();
    return { result, output: lines.join("\n") };
  } finally {
    console.info = info;
    process.stdout.write = write;
  }
}

const originalRegistryPath = process.env.FEWBIE_REGISTRY_PATH;
after(() => {
  if (originalRegistryPath === undefined) delete process.env.FEWBIE_REGISTRY_PATH;
  else process.env.FEWBIE_REGISTRY_PATH = originalRegistryPath;
});

test("hashContent normalizes line endings", () => {
  assert.equal(hashContent("a\r\nb\r\n"), hashContent("a\nb\n"));
});

test("apply writes a lockfile with the registry commit and installed hashes", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    const lock = await readLockfile(fixture.project);
    assert.ok(lock);
    assert.equal(lock.registry.commit, "dev");
    assert.equal(lock.modules.fixture.version, "1.2.3");
    assert.equal(lock.modules.fixture.commit, "dev");
    assert.equal(lock.modules.fixture.files[TARGET], hashContent(ORIGINAL));
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update --check fails and classifies a host-only edit", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.writeFile(fixture.target, "export const fixture = 2;\n");
    await assert.rejects(
      quiet(() => runUpdate({ cwd: fixture.project, check: true })),
      /modified locally/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update --check fails when the registry moved under an untouched file", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.writeFile(path.join(fixture.registry, "fixture", TARGET), "export const fixture = 3;\n");
    await assert.rejects(
      quiet(() => runUpdate({ cwd: fixture.project, check: true })),
      /behind the registry/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update --check reports a conflict when both sides moved", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.writeFile(fixture.target, "export const fixture = 4;\n");
    await fs.writeFile(path.join(fixture.registry, "fixture", TARGET), "export const fixture = 5;\n");
    await assert.rejects(
      quiet(() => runUpdate({ cwd: fixture.project, check: true })),
      /conflict/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update --preview classifies without writing", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.writeFile(path.join(fixture.registry, "fixture", TARGET), "export const fixture = 6;\n");
    const { output } = await quiet(() => runUpdate({ cwd: fixture.project, preview: true, yes: true }));
    assert.match(output, /registry moved/);
    assert.equal(await fs.readFile(fixture.target, "utf8"), ORIGINAL);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update writes a pristine file and refreshes the lockfile baseline", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    const latest = "export const fixture = 7;\n";
    await fs.writeFile(path.join(fixture.registry, "fixture", TARGET), latest);
    await quiet(() => runUpdate({ cwd: fixture.project, yes: true }));
    assert.equal(await fs.readFile(fixture.target, "utf8"), latest);
    const lock = await readLockfile(fixture.project);
    assert.equal(lock?.modules.fixture.files[TARGET], hashContent(latest));
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update --check fails when a declared file is missing (R82-05)", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.rm(fixture.target);
    await assert.rejects(
      quiet(() => runUpdate({ cwd: fixture.project, check: true })),
      /file\(s\) are missing/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("apply removes a pristine target the registry renamed away (R82-08)", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    const renamed = "src/features/fixture/next.ts";
    await fs.mkdir(path.join(fixture.registry, "fixture", "src/features/fixture"), { recursive: true });
    await fs.writeFile(path.join(fixture.registry, "fixture", renamed), "export const next = 1;\n");
    await fs.writeFile(
      path.join(fixture.registry, "fixture", REGISTRY_MANIFEST_FILE),
      JSON.stringify({
        name: "fixture",
        type: "registry:feature",
        title: "Fixture",
        files: [renamed],
        contract: {
          version: "1.2.3",
          framework: "^1.9.0",
          entry: renamed,
          labels: ["title"],
          ports: ["save"],
          ui: ["button"],
          states: ["ready"],
        },
      }),
    );

    await quiet(() =>
      applyModuleSelection({
        projectRoot: fixture.project,
        current: ["fixture"],
        next: ["fixture"],
        skipInstall: true,
      }),
    );
    await assert.rejects(fs.access(fixture.target));
    assert.equal(await fs.readFile(path.join(fixture.project, renamed), "utf8"), "export const next = 1;\n");
    const lock = await readLockfile(fixture.project);
    assert.deepEqual(Object.keys(lock!.modules.fixture.files), [renamed]);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("remove still cleans up an item the registry has deleted (R83-12)", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    // The registry dropped the item before the host ran `modules remove`, so
    // resolving the old declaration set would throw (R83-12). Another item
    // keeps the registry root recognizable after the deletion.
    await fs.mkdir(path.join(fixture.registry, "keep"), { recursive: true });
    await fs.writeFile(
      path.join(fixture.registry, "keep", REGISTRY_MANIFEST_FILE),
      JSON.stringify({ name: "keep", type: "registry:feature", title: "Keep", files: ["src/keep.ts"] }),
    );
    await fs.mkdir(path.join(fixture.registry, "keep", "src"), { recursive: true });
    await fs.writeFile(path.join(fixture.registry, "keep", "src/keep.ts"), "export {};\n");
    await fs.rm(path.join(fixture.registry, "fixture"), { recursive: true, force: true });
    await fs.writeFile(path.join(fixture.project, "fewbie.json"), `${JSON.stringify({ modules: [] }, null, 2)}\n`);

    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: ["fixture"], next: [], skipInstall: true }),
    );

    await assert.rejects(fs.access(fixture.target));
    const lock = await readLockfile(fixture.project);
    assert.deepEqual(Object.keys(lock!.modules), []);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update cleans up files whose module left the declaration by hand (R83-12)", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    // Hand-edited declaration: no `modules remove` ran, so apply never saw the
    // removal; the lockfile is the only record that the file was installed.
    await fs.writeFile(path.join(fixture.project, "fewbie.json"), `${JSON.stringify({ modules: [] }, null, 2)}\n`);

    await quiet(() => runUpdate({ cwd: fixture.project, yes: true }));

    await assert.rejects(fs.access(fixture.target));
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update fails closed when a declared file has no lockfile baseline (R83-13)", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    const latest = "export const fixture = 9;\n";
    await fs.writeFile(path.join(fixture.registry, "fixture", TARGET), latest);
    // Deleting one lockfile line used to downgrade the file to legacy, which is
    // auto-writable; a corrupt baseline must not silently overwrite the host.
    const lock = JSON.parse(await fs.readFile(path.join(fixture.project, "fewbie.lock.json"), "utf8"));
    delete lock.modules.fixture.files[TARGET];
    await fs.writeFile(path.join(fixture.project, "fewbie.lock.json"), JSON.stringify(lock));

    await assert.rejects(
      quiet(() => runUpdate({ cwd: fixture.project, check: true })),
      /no lockfile baseline/,
    );
    await quiet(() => runUpdate({ cwd: fixture.project, yes: true }));
    assert.equal(await fs.readFile(fixture.target, "utf8"), ORIGINAL);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update rejects a lockfile entry whose files field is not a hash map (R82-06)", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.writeFile(
      path.join(fixture.project, "fewbie.lock.json"),
      JSON.stringify({
        lockfileVersion: 1,
        registry: { url: "", ref: "", commit: "dev" },
        modules: { fixture: { version: "1.2.3", commit: "dev", files: "nope" } },
      }),
    );
    await assert.rejects(
      quiet(() => runUpdate({ cwd: fixture.project, check: true })),
      /files must be/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("update without a lockfile keeps the 1.8 drift behavior", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.rm(path.join(fixture.project, "fewbie.lock.json"));
    await fs.writeFile(fixture.target, "export const fixture = 8;\n");
    await assert.rejects(
      quiet(() => runUpdate({ cwd: fixture.project, check: true })),
      /behind the registry/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("removing a module deletes pristine files and keeps host-modified ones", async () => {
  const fixture = await setup();
  try {
    await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: [], next: ["fixture"], skipInstall: true }),
    );
    await fs.writeFile(fixture.target, "export const fixture = 9;\n");
    const { result } = await quiet(() =>
      applyModuleSelection({ projectRoot: fixture.project, current: ["fixture"], next: [], skipInstall: true }),
    );
    assert.deepEqual(result.kept, [TARGET]);
    assert.equal(await fs.readFile(fixture.target, "utf8"), "export const fixture = 9;\n");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
