import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { runAdapters } from "../src/commands/modules/adapters";
import { adapterSource } from "../src/lib/i18n-contract";
import { REGISTRY_MANIFEST_FILE } from "../src/registry/types";

interface Fixture {
  root: string;
  project: string;
  /** Write both locale dictionaries; caller mutates the sub-tree. */
  writeMessages(en: unknown, zh?: unknown): Promise<void>;
  dispose(): Promise<void>;
}

interface SetupOptions {
  /** Override the interface name inside the module sources. */
  labelsType?: string;
  /** Extra label keys the contract declares but the dictionaries lack. */
  extraLabels?: string[];
  /** Replace the whole i18n block in fewbie.json. */
  i18n?: unknown;
}

const TITLE = "Fixture label";

async function setup(options: SetupOptions = {}): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-adapters-"));
  const registry = path.join(root, "registry");
  const project = path.join(root, "project");
  const module = path.join(registry, "fixture");
  const labelsType = options.labelsType ?? "FixtureLabels";
  const labels = ["title", "description", ...(options.extraLabels ?? [])];

  // Authored payload sits at the install target minus the install root (ADR-071).
  const storage = (target: string): string => target.slice("src/fewbie/modules/fixture/".length);
  await fs.mkdir(path.join(module, path.dirname(storage("src/fewbie/modules/fixture/features/fixture/index.ts"))), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(module, REGISTRY_MANIFEST_FILE),
    JSON.stringify({
      name: "fixture",
      type: "registry:block",
      title: "Fixture",
      files: [
        "src/fewbie/modules/fixture/features/fixture/index.ts",
        "src/fewbie/modules/fixture/features/fixture/types.ts",
        "src/fewbie/modules/fixture/features/fixture/fixture.tsx",
      ],
      contract: {
        version: "1.0.0",
        framework: "^1.10.0",
        entry: "src/fewbie/modules/fixture/features/fixture/index.ts",
        labels,
        ports: ["save"],
        ui: ["button"],
        states: ["ready"],
      },
    }),
  );
  await fs.writeFile(
    path.join(module, storage("src/fewbie/modules/fixture/features/fixture/index.ts")),
    `export { Fixture } from "./fixture";\nexport type { ${labelsType} } from "./types";\n`,
  );
  await fs.writeFile(
    path.join(module, storage("src/fewbie/modules/fixture/features/fixture/types.ts")),
    `export interface ${labelsType} {\n${labels.map((key) => `  ${key}: string;`).join("\n")}\n}\n`,
  );
  await fs.writeFile(
    path.join(module, storage("src/fewbie/modules/fixture/features/fixture/fixture.tsx")),
    `export function Fixture(): null {\n  return null;\n}\n`,
  );

  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(
    path.join(project, "package.json"),
    `${JSON.stringify({ name: "host", private: true }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(project, "fewbie.json"),
    `${JSON.stringify(
      {
        modules: ["fixture"],
        i18n:
          options.i18n === undefined
            ? {
                library: "next-intl",
                messages: ["src/i18n/messages/en.json", "src/i18n/messages/zh.json"],
                namespace: "modules",
              }
            : options.i18n,
      },
      null,
      2,
    )}\n`,
  );

  async function writeMessages(en: unknown, zh: unknown = en): Promise<void> {
    await fs.mkdir(path.join(project, "src/i18n/messages"), { recursive: true });
    await fs.writeFile(path.join(project, "src/i18n/messages/en.json"), `${JSON.stringify(en, null, 2)}\n`);
    await fs.writeFile(path.join(project, "src/i18n/messages/zh.json"), `${JSON.stringify(zh, null, 2)}\n`);
  }

  process.env.FEWBIE_REGISTRY_PATH = registry;
  await writeMessages({
    modules: { fixture: { title: TITLE, description: "Fixture description" } },
  });

  return {
    root,
    project,
    writeMessages,
    dispose: () => fs.rm(root, { recursive: true, force: true }),
  };
}

const originalRegistryPath = process.env.FEWBIE_REGISTRY_PATH;
after(() => {
  if (originalRegistryPath === undefined) delete process.env.FEWBIE_REGISTRY_PATH;
  else process.env.FEWBIE_REGISTRY_PATH = originalRegistryPath;
});

async function readAdapter(project: string): Promise<string> {
  return fs.readFile(path.join(project, "src/fewbie/adapters/fixture.tsx"), "utf8");
}

describe("adapterSource", () => {
  it("intersects the layer label types of a merged block (ADR-069)", () => {
    const source = adapterSource({
      name: "account-access",
      labels: ["signIn", "sendReset"],
      namespace: "modules",
      layers: [
        { labelsType: "LoginLabels", entry: "src/fewbie/modules/account-access/features/login/index.ts" },
        { labelsType: "ForgotLabels", entry: "src/fewbie/modules/account-access/features/forgot/index.ts" },
      ],
    });

    assert.match(source, /export type AccountAccessModuleLabels = LoginLabels & ForgotLabels;/);
    assert.match(source, /export function useAccountAccessLabels\(\): AccountAccessModuleLabels \{/);
    assert.match(source, /useTranslations\("modules\.account-access"\)/);
  });
});

describe("fewbie modules adapters", () => {
  it("generates the golden label adapter from the module contract", async () => {
    const fixture = await setup();
    after(() => fixture.dispose());

    await runAdapters({ cwd: fixture.project });

    assert.equal(
      await readAdapter(fixture.project),
      `"use client";

// Generated by \`fewbie modules adapters\` from the fixture module contract.
// Regenerate after \`fewbie modules update\`; edit the registry module instead.

import { useTranslations } from "next-intl";

import type { FixtureLabels } from "@/fewbie/modules/fixture/features/fixture";

/** Labels for the \`fixture\` module, resolved from the \`modules.fixture\` namespace. */
export function useFixtureLabels(): FixtureLabels {
  const t = useTranslations("modules.fixture");
  return {
    title: t("title"),
    description: t("description"),
  };
}
`,
    );
  });

  it("locates the labels interface by its members, not by the module name", async () => {
    const fixture = await setup({ labelsType: "LoginLabels" });
    after(() => fixture.dispose());

    await runAdapters({ cwd: fixture.project });

    assert.match(
      await readAdapter(fixture.project),
      /import type \{ LoginLabels \} from "@\/fewbie\/modules\/fixture\/features\/fixture"/,
    );
  });

  it("honours a custom namespace", async () => {
    const fixture = await setup({
      i18n: {
        library: "next-intl",
        messages: ["src/i18n/messages/en.json", "src/i18n/messages/zh.json"],
        namespace: "surfaces",
      },
    });
    after(() => fixture.dispose());
    await fixture.writeMessages({ surfaces: { fixture: { title: TITLE, description: "D" } } });

    await runAdapters({ cwd: fixture.project });

    assert.match(await readAdapter(fixture.project), /useTranslations\("surfaces\.fixture"\)/);
  });

  it("is idempotent and passes --check after generation", async () => {
    const fixture = await setup();
    after(() => fixture.dispose());

    await runAdapters({ cwd: fixture.project });
    const first = await readAdapter(fixture.project);
    await runAdapters({ cwd: fixture.project });
    assert.equal(await readAdapter(fixture.project), first);

    await runAdapters({ cwd: fixture.project, check: true });
  });

  it("fails --check when the adapter is missing or drifted", async () => {
    const fixture = await setup();
    after(() => fixture.dispose());

    await assert.rejects(runAdapters({ cwd: fixture.project, check: true }), /adapter missing/);

    await runAdapters({ cwd: fixture.project });
    await fs.appendFile(path.join(fixture.project, "src/fewbie/adapters/fixture.tsx"), "\n// local edit\n");
    await assert.rejects(runAdapters({ cwd: fixture.project, check: true }), /adapter differs/);
  });

  it("fails generation when a locale is missing a label key", async () => {
    const fixture = await setup();
    after(() => fixture.dispose());
    await fixture.writeMessages(
      { modules: { fixture: { title: TITLE, description: "D" } } },
      { modules: { fixture: { title: "标题" } } },
    );

    await assert.rejects(
      runAdapters({ cwd: fixture.project }),
      /missing label key\(s\) description in "modules\.fixture"/,
    );
    await assert.rejects(fs.access(path.join(fixture.project, "src/fewbie/adapters/fixture.tsx")));
  });

  it("rejects host-only copy left in the module namespace", async () => {
    const fixture = await setup();
    after(() => fixture.dispose());
    await fixture.writeMessages({
      modules: { fixture: { title: TITLE, description: "D", toastUpdated: "Saved" } },
    });

    await assert.rejects(runAdapters({ cwd: fixture.project, check: true }), /unexpected key\(s\) toastUpdated/);
  });

  it("refuses to run without an i18n declaration", async () => {
    const fixture = await setup();
    after(() => fixture.dispose());
    await fs.writeFile(
      path.join(fixture.project, "fewbie.json"),
      `${JSON.stringify({ modules: ["fixture"] }, null, 2)}\n`,
    );

    await assert.rejects(runAdapters({ cwd: fixture.project }), /has no "i18n" declaration/);
  });

  it("refuses an unsupported i18n library", async () => {
    const fixture = await setup({ i18n: { library: "i18next", messages: ["src/i18n/messages/en.json"] } });
    after(() => fixture.dispose());

    await assert.rejects(runAdapters({ cwd: fixture.project }), /i18n\.library/);
  });

  it("does not write in --dry-run mode", async () => {
    const fixture = await setup();
    after(() => fixture.dispose());

    await runAdapters({ cwd: fixture.project, dryRun: true });

    await assert.rejects(fs.access(path.join(fixture.project, "src/fewbie/adapters/fixture.tsx")));
  });
});
