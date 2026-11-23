import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

import { runDoctor } from "../src/commands/doctor";

interface Fixture {
  root: string;
  project: string;
  dispose(): Promise<void>;
}

const originalRegistryPath = process.env.FEWBIE_REGISTRY_PATH;

beforeEach(() => {
  delete process.env.FEWBIE_REGISTRY_PATH;
});

after(() => {
  if (originalRegistryPath === undefined) delete process.env.FEWBIE_REGISTRY_PATH;
  else process.env.FEWBIE_REGISTRY_PATH = originalRegistryPath;
});

/**
 * Minimal project: doctor reads structure, the declared registry and the message
 * dictionaries (ADR-074 D1 overlap check). Template gates stay quiet because the
 * fixture ships no framework manifest.
 */
async function setup(frameworkCommon: unknown, hostCommon: unknown): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-doctor-"));
  const registry = path.join(root, "registry");
  await fs.mkdir(path.join(registry, "packages", "modules", "dummy"), { recursive: true });
  await fs.writeFile(
    path.join(registry, "packages", "modules", "dummy", "fewbie.module.json"),
    JSON.stringify({ name: "dummy", type: "registry:lib", title: "Dummy", files: [] }),
  );
  process.env.FEWBIE_REGISTRY_PATH = registry;

  const project = path.join(root, "project");
  await fs.mkdir(path.join(project, "src", "i18n", "messages"), { recursive: true });
  await fs.writeFile(path.join(project, "package.json"), JSON.stringify({ name: "host", private: true }));
  await fs.writeFile(path.join(project, "components.json"), JSON.stringify({}));
  await fs.writeFile(path.join(project, "fewbie.json"), JSON.stringify({ modules: [] }));
  await fs.writeFile(
    path.join(project, "src/i18n/messages/framework.en.json"),
    JSON.stringify({ common: frameworkCommon }),
  );
  await fs.writeFile(path.join(project, "src/i18n/messages/en.json"), JSON.stringify({ common: hostCommon }));

  return {
    root,
    project,
    dispose: () => fs.rm(root, { recursive: true, force: true }),
  };
}

describe("fewbie doctor framework/host message overlap (ADR-074 D1)", () => {
  it("fails when a host common key shadows a framework common key", async () => {
    const fixture = await setup({ ok: "OK", back: "Back" }, { ok: "OK-ish", cancel: "Cancel" });
    try {
      const result = await runDoctor({ cwd: fixture.project });
      const i18n = result.findings.filter((finding) => finding.category === "i18n");
      assert.equal(i18n.length, 1);
      assert.equal(i18n[0].severity, "error");
      assert.match(i18n[0].message, /common key\(s\) ok/);
    } finally {
      await fixture.dispose();
    }
  });

  it("passes when host and framework common key sets are disjoint", async () => {
    const fixture = await setup({ ok: "OK", back: "Back" }, { cancel: "Cancel" });
    try {
      const result = await runDoctor({ cwd: fixture.project });
      assert.equal(result.findings.filter((finding) => finding.category === "i18n").length, 0);
    } finally {
      await fixture.dispose();
    }
  });
});
