import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { listTemplateFiles, runTemplateUpdate } from "../src/commands/template/update";
import {
  buildFrameworkManifest,
  FRAMEWORK_DEPENDENCIES,
  FRAMEWORK_MANIFEST_PATH,
  FRAMEWORK_MARKER_END,
  FRAMEWORK_MARKER_START,
  hashContent,
  resolveTemplateAsset,
  serializeFrameworkManifest,
  SYNCABLE_ASSETS,
} from "../src/lib/template-ownership";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function globalsCss(block: string, host: string): string {
  return `@import "tailwindcss";\n\n${host}\n\n${FRAMEWORK_MARKER_START}\n${block}\n${FRAMEWORK_MARKER_END}\n`;
}

function agentsMd(block: string, host: string): string {
  return (
    `# Agents\n\n<!-- fewbie:framework:start -->\n${block}\n<!-- fewbie:framework:end -->\n` +
    (host === "" ? "" : `\n${host}\n`)
  );
}

// next.config.ts is a scaffold asset (ADR-035): both copies call the framework
// entry point, but only the host file carries host configuration.
const NEXT_CONFIG_TEMPLATE =
  'import { withFewbie } from "./next.config.framework";\n\nexport default withFewbie({});\n';
const NEXT_CONFIG_HOST =
  'import { withFewbie } from "./next.config.framework";\n\n' +
  "export default withFewbie({ devIndicators: false });\n";

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), content);
}

/**
 * Regenerate the template's baseline manifest (ADR-056 D3). The real template
 * repository does this through `fewbie template update --template-path .`; the
 * fixture needs the same artifact after every framework change.
 */
async function writeTemplateBaseline(root: string): Promise<void> {
  const files = new Map<string, string | Buffer | null>();
  for (const filePath of await listTemplateFiles(root)) {
    const asset = resolveTemplateAsset(filePath);
    if (asset?.ownership !== "framework") continue;
    const absolute = path.join(root, filePath);
    files.set(
      filePath,
      await (asset.binary ? fs.readFile(absolute).catch(() => null) : fs.readFile(absolute, "utf8").catch(() => null)),
    );
  }
  const manifest = buildFrameworkManifest(files, SYNCABLE_ASSETS);
  await writeFile(root, FRAMEWORK_MANIFEST_PATH, serializeFrameworkManifest(manifest));
}

async function makeTemplate(): Promise<string> {
  const root = await makeTempDir("fewbie-update-template-");
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fewbie-basic-template" }, null, 2));
  await writeFile(root, "next.config.ts", NEXT_CONFIG_TEMPLATE);
  await writeFile(root, "next.config.framework.ts", "export const withFewbie = (config: object = {}) => config;\n");
  await writeFile(root, "src/lib/utils.ts", "export const cn = () => '';\n");
  await writeFile(root, "src/app/globals.css", globalsCss("--primary: template;", ""));
  await writeFile(root, "AGENTS.md", agentsMd("Template contract.", ""));
  // Host-owned: template update must never copy this.
  await writeFile(root, "src/app/page.tsx", "// template page\n");
  await writeTemplateBaseline(root);
  return root;
}

async function makeProject(): Promise<string> {
  const root = await makeTempDir("fewbie-update-project-");
  // Framework dependencies are required (ADR-025): package.json is host-owned,
  // so template update only warns/errors when they are absent.
  const dependencies = Object.fromEntries(FRAMEWORK_DEPENDENCIES.map((dependency) => [dependency.name, "*"]));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", dependencies }, null, 2));
  // Scaffold: adopted, so the host copy must be left alone (ADR-035).
  await writeFile(root, "next.config.ts", NEXT_CONFIG_HOST);
  await writeFile(root, "src/app/globals.css", globalsCss("--primary: host;", ":root { --host: 42; }"));
  await writeFile(root, "AGENTS.md", agentsMd("Stale contract.", "## Project rules\n\nKeep me."));
  await writeFile(root, "src/app/page.tsx", "// host page\n");
  return root;
}

/** Rewrite the project manifest with a subset of the framework dependencies. */
async function dropDependencies(root: string, names: string[]): Promise<void> {
  const manifestPath = path.join(root, "package.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  for (const name of names) delete manifest.dependencies?.[name];
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

describe("fewbie template update", () => {
  it("--check refuses to plan framework updates without a baseline (R82-02)", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    // A pre-manifest project that already holds a framework file the template
    // changed: overwriting it could destroy host edits.
    const hostCopy = "export const cn = () => 'host v1';\n";
    await writeFile(project, "src/lib/utils.ts", hostCopy);

    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /No \.fewbie\/framework\.json/,
    );
    await assert.rejects(runTemplateUpdate({ cwd: project, templatePath: template }), /No \.fewbie\/framework\.json/);
    assert.equal(await fs.readFile(path.join(project, "src/lib/utils.ts"), "utf8"), hostCopy);
    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), NEXT_CONFIG_HOST);

    // --adopt records the template as the baseline and keeps the host copy.
    await runTemplateUpdate({ cwd: project, adopt: true, templatePath: template });
    assert.equal(await fs.readFile(path.join(project, "src/lib/utils.ts"), "utf8"), hostCopy);
    await assert.doesNotReject(() => fs.access(path.join(project, FRAMEWORK_MANIFEST_PATH)));

    // With a baseline the same gate reports the conflict as drift.
    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /drift from the template/,
    );
  });

  it("writes framework files, updates only the marked block and creates missing files", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    await runTemplateUpdate({ cwd: project, templatePath: template });

    // Scaffold: the host copy is adopted and therefore never rewritten.
    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), NEXT_CONFIG_HOST);
    const globals = await fs.readFile(path.join(project, "src/app/globals.css"), "utf8");
    assert.match(globals, /--primary: template;/);
    assert.match(globals, /--host: 42;/);
    assert.ok(await fs.stat(path.join(project, "src/lib/utils.ts")));
    assert.ok(await fs.stat(path.join(project, "next.config.framework.ts")));
    // Mixed AGENTS.md: the framework block is updated, the host area is kept.
    const agents = await fs.readFile(path.join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /Template contract\./);
    assert.doesNotMatch(agents, /Stale contract\./);
    assert.match(agents, /## Project rules\n\nKeep me\./);
    // Host-owned file stays untouched even though the template ships one.
    assert.equal(await fs.readFile(path.join(project, "src/app/page.tsx"), "utf8"), "// host page\n");
  });

  it("refuses to guess when the project copy lost its markers", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await writeFile(project, "src/app/globals.css", ":root { --primary: host; }\n");

    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /drift from the template/,
    );
    assert.equal(await fs.readFile(path.join(project, "src/app/globals.css"), "utf8"), ":root { --primary: host; }\n");
  });

  it("reports drift for a project AGENTS.md that lost its markers, without touching it", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await writeFile(project, "AGENTS.md", "# Agents\n\nHand-written notes.\n");

    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /drift from the template/,
    );
    assert.equal(await fs.readFile(path.join(project, "AGENTS.md"), "utf8"), "# Agents\n\nHand-written notes.\n");
  });

  it("restricts the scope to the requested path prefixes", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    await runTemplateUpdate({ cwd: project, templatePath: template, paths: ["src/lib"] });

    assert.ok(await fs.stat(path.join(project, "src/lib/utils.ts")));
    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), NEXT_CONFIG_HOST);
  });

  it("fails template-repository CI when a template file is unclassified", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await writeFile(template, "docs/new.md", "# New\n");

    await assert.rejects(
      runTemplateUpdate({ cwd: project, templatePath: template, check: true, registryComplete: true }),
      /missing from the ownership registry/,
    );
    // Business files in a created project are not template assets, so a
    // converged project's copied gate (no flag) stays green.
    await runTemplateUpdate({ cwd: project, templatePath: template });
    await runTemplateUpdate({ cwd: project, templatePath: template, check: true });
  });

  it("--check fails when a framework dependency is missing", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await dropDependencies(project, ["next-intl"]);

    await assert.rejects(runTemplateUpdate({ cwd: project, check: true, templatePath: template }), (error: Error) => {
      assert.match(error.message, /Missing framework dependencies/);
      assert.match(error.message, /next-intl \(required by next\.config\.ts/);
      assert.match(error.message, /npm install next-intl/);
      return true;
    });
    // The gate runs before any file is written.
    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), NEXT_CONFIG_HOST);
  });

  it("warns about missing framework dependencies but still syncs", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await dropDependencies(project, ["next-intl"]);

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      await runTemplateUpdate({ cwd: project, templatePath: template });
    } finally {
      console.warn = originalWarn;
    }

    assert.ok(await fs.stat(path.join(project, "src/lib/utils.ts")));
    // The framework file still syncs; only the scaffold copy stays untouched.
    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), NEXT_CONFIG_HOST);
    const joined = warnings.join("\n");
    assert.match(joined, /Framework dependencies missing/);
    assert.match(joined, /npm install next-intl/);
  });

  it("creates a scaffold file the project does not have yet", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await fs.rm(path.join(project, "next.config.ts"));

    await runTemplateUpdate({ cwd: project, templatePath: template });

    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), NEXT_CONFIG_TEMPLATE);
  });

  it("reports a scaffold copy that lost the framework entry point without rewriting it", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    const legacyHostConfig = "export default { output: 'standalone' };\n";
    await writeFile(project, "next.config.ts", legacyHostConfig);

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      // --check fails, then the apply run still leaves the host file alone.
      await assert.rejects(
        runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
        /drift from the template/,
      );
      await runTemplateUpdate({ cwd: project, templatePath: template });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), legacyHostConfig);
    const joined = warnings.join("\n");
    assert.match(joined, /next\.config\.ts: the host copy does not reference the framework entry point/);
  });

  it("refuses to overwrite a framework file the host modified (ADR-056 D3)", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    // First sync ships the baseline into the project.
    await runTemplateUpdate({ cwd: project, templatePath: template });
    const baseline = await fs.readFile(path.join(project, FRAMEWORK_MANIFEST_PATH), "utf8");
    assert.match(baseline, /src\/lib\/utils\.ts/);

    // Host copy still matches the baseline: a template change upgrades silently.
    await writeFile(template, "src/lib/utils.ts", "export const cn = () => 'template v2';\n");
    await writeTemplateBaseline(template);
    await runTemplateUpdate({ cwd: project, templatePath: template });
    assert.match(await fs.readFile(path.join(project, "src/lib/utils.ts"), "utf8"), /template v2/);

    // Host edit plus a template change: a conflict, never an overwrite.
    await writeFile(project, "src/lib/utils.ts", "export const cn = () => 'host edit';\n");
    await writeFile(template, "src/lib/utils.ts", "export const cn = () => 'template v3';\n");
    await writeTemplateBaseline(template);

    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /modified-framework conflict/,
    );
    await runTemplateUpdate({ cwd: project, templatePath: template });
    assert.match(await fs.readFile(path.join(project, "src/lib/utils.ts"), "utf8"), /host edit/);
  });

  it("records the template bytes as the baseline after --adopt (R83-01)", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    // A pre-manifest host whose framework copy diverges from the template.
    const hostCopy = "export const cn = () => 'host edit';\n";
    const templateCopy = "export const cn = () => '';\n";
    await writeFile(project, "src/lib/utils.ts", hostCopy);

    await runTemplateUpdate({ cwd: project, adopt: true, templatePath: template });

    // The baseline must describe what the template shipped, not what the host
    // happens to hold; otherwise the next run cannot tell the edit apart.
    const manifest = JSON.parse(await fs.readFile(path.join(project, FRAMEWORK_MANIFEST_PATH), "utf8")) as {
      files: Record<string, string>;
    };
    assert.equal(manifest.files["src/lib/utils.ts"], hashContent(templateCopy));

    // A template change after adoption must not overwrite the host edit.
    const templateV2 = "export const cn = () => 'template v2';\n";
    await writeFile(template, "src/lib/utils.ts", templateV2);
    await writeTemplateBaseline(template);
    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /modified-framework conflict/,
    );
    await runTemplateUpdate({ cwd: project, templatePath: template });
    assert.equal(await fs.readFile(path.join(project, "src/lib/utils.ts"), "utf8"), hostCopy);
  });

  it("copies binary framework assets byte for byte and hashes their bytes (R83-02)", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    // Invalid UTF-8, so a text channel would replace bytes with U+FFFD.
    const fontBytes = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28]);
    await fs.mkdir(path.join(template, "src/app/fonts"), { recursive: true });
    await fs.writeFile(path.join(template, "src/app/fonts/inter-latin.woff2"), fontBytes);
    await writeTemplateBaseline(template);

    await runTemplateUpdate({ cwd: project, templatePath: template });

    const copied = await fs.readFile(path.join(project, "src/app/fonts/inter-latin.woff2"));
    assert.deepEqual(copied, fontBytes);
    const manifest = JSON.parse(await fs.readFile(path.join(project, FRAMEWORK_MANIFEST_PATH), "utf8")) as {
      files: Record<string, string>;
    };
    const byteHash = createHash("sha256").update(fontBytes).digest("hex");
    assert.equal(manifest.files["src/app/fonts/inter-latin.woff2"], byteHash);
  });

  it("upgrades a changed binary asset and keeps host edits as a conflict (R83-02)", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    const fontPath = "src/app/fonts/inter-latin.woff2";
    const v1 = Buffer.from([0x00, 0xff, 0x10, 0x80]);
    const v2 = Buffer.from([0x00, 0xff, 0x20, 0x81, 0xfe]);
    await fs.mkdir(path.join(template, "src/app/fonts"), { recursive: true });
    await fs.writeFile(path.join(template, fontPath), v1);
    await writeTemplateBaseline(template);
    await runTemplateUpdate({ cwd: project, templatePath: template });
    assert.deepEqual(await fs.readFile(path.join(project, fontPath)), v1);

    // Host copy still matches the baseline: the template bytes replace it.
    await fs.writeFile(path.join(template, fontPath), v2);
    await writeTemplateBaseline(template);
    await runTemplateUpdate({ cwd: project, templatePath: template });
    assert.deepEqual(await fs.readFile(path.join(project, fontPath)), v2);
    const manifestAfterUpgrade = JSON.parse(await fs.readFile(path.join(project, FRAMEWORK_MANIFEST_PATH), "utf8")) as {
      files: Record<string, string>;
    };
    assert.equal(manifestAfterUpgrade.files[fontPath], createHash("sha256").update(v2).digest("hex"));

    // Host edit plus a template change: a conflict, never an overwrite.
    const hostBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    await fs.writeFile(path.join(project, fontPath), hostBytes);
    await fs.writeFile(path.join(template, fontPath), Buffer.from([0x00, 0x01, 0x02]));
    await writeTemplateBaseline(template);
    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /modified-framework conflict/,
    );
    await runTemplateUpdate({ cwd: project, templatePath: template });
    assert.deepEqual(await fs.readFile(path.join(project, fontPath)), hostBytes);
  });

  it("fails closed when a text-declared asset is not valid UTF-8 (R83-02)", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    // A text-declared framework asset holding non-UTF-8 bytes: fail closed.
    await fs.writeFile(path.join(template, "src/lib/utils.ts"), Buffer.from([0xff, 0xfe, 0x00, 0x80]));
    await writeTemplateBaseline(template);

    await assert.rejects(runTemplateUpdate({ cwd: project, templatePath: template }), /not valid UTF-8/);
    await assert.rejects(fs.readFile(path.join(project, "src/lib/utils.ts")));
  });
});
