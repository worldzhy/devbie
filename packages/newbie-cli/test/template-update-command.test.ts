import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { runTemplateUpdate } from "../src/commands/template/update";
import { CliError } from "@devbie/cli-kit";

/**
 * Exercises runTemplateUpdate against a local template directory
 * (--template-path), so no git clone happens.
 */
describe("runTemplateUpdate --check", () => {
  let project: string;
  let template: string;

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-ut-project-"));
    template = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-ut-template-"));
    // resolveTemplate requires a package.json at the template root.
    await fs.writeFile(path.join(template, "package.json"), "{}", "utf8");
  });

  after(async () => {
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(template, { recursive: true, force: true });
  });

  it("passes when nothing drifts", async () => {
    await runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false });
  });

  it("rejects with CliError when a skeleton file drifts", async () => {
    await fs.mkdir(path.join(template, "deploy/scripts"), { recursive: true });
    await fs.writeFile(path.join(template, "deploy/scripts/lib.sh"), "# template\n", "utf8");
    await assert.rejects(
      runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false }),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /drift from the template/);
        return true;
      },
    );
  });

  it("passes again once the drift is applied", async () => {
    await runTemplateUpdate({ cwd: project, templatePath: template, dryRun: false });
    assert.equal(await fs.readFile(path.join(project, "deploy/scripts/lib.sh"), "utf8"), "# template\n");
    await runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false });
  });
});

describe("runTemplateUpdate path filter", () => {
  let project: string;
  let template: string;

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-utf-project-"));
    template = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-utf-template-"));
    await fs.writeFile(path.join(template, "package.json"), "{}", "utf8");
    // Drift outside any deploy/ scope: tsconfig differs.
    await fs.writeFile(path.join(template, "tsconfig.json"), '{ "from": "template" }\n', "utf8");
    await fs.writeFile(path.join(project, "tsconfig.json"), '{ "from": "project" }\n', "utf8");
    // In-sync deploy file so the deploy/ scope itself is green.
    await fs.mkdir(path.join(template, "deploy/scripts"), { recursive: true });
    await fs.mkdir(path.join(project, "deploy/scripts"), { recursive: true });
    await fs.writeFile(path.join(template, "deploy/scripts/lib.sh"), "# same\n", "utf8");
    await fs.writeFile(path.join(project, "deploy/scripts/lib.sh"), "# same\n", "utf8");
  });

  after(async () => {
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(template, { recursive: true, force: true });
  });

  it("passes with a deploy/ filter when the drift lives outside the scope", async () => {
    await runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false, paths: ["deploy/"] });
  });

  it("accepts a directory prefix without a trailing slash", async () => {
    await runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false, paths: ["deploy"] });
  });

  it("rejects when the drift is inside the filtered scope", async () => {
    await assert.rejects(
      runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false, paths: ["tsconfig.json"] }),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /drift from the template/);
        return true;
      },
    );
  });

  it("rejects a filter matching no template files (fail fast on CI typos)", async () => {
    await assert.rejects(
      runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false, paths: ["nonexistent/"] }),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /No framework-managed template files match/);
        return true;
      },
    );
  });
});

describe("runTemplateUpdate ownership guard", () => {
  let project: string;
  let template: string;

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-utg-project-"));
    template = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-utg-template-"));
    await fs.writeFile(path.join(template, "package.json"), "{}", "utf8");
  });

  after(async () => {
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(template, { recursive: true, force: true });
  });

  it("rejects an unclassified template file (ADR-009 D4 unlisted = error)", async () => {
    await fs.writeFile(path.join(template, "unclassified.txt"), "x", "utf8");
    await assert.rejects(
      runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false }),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /ownership registry/);
        assert.match(error.message, /unclassified\.txt/);
        return true;
      },
    );
    await fs.rm(path.join(template, "unclassified.txt"));
  });

  it("ignores runtime output and the per-project lockfile while scanning", async () => {
    await fs.mkdir(path.join(template, "node_modules/pkg"), { recursive: true });
    await fs.writeFile(path.join(template, "node_modules/pkg/index.js"), "", "utf8");
    await fs.writeFile(path.join(template, "package-lock.json"), "{}", "utf8");
    await fs.writeFile(path.join(template, ".env"), "HOST=1", "utf8");
    await runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false });
  });

  it("reports missing-markers for a framework block file without markers", async () => {
    await fs.writeFile(
      path.join(template, ".env.example"),
      "HOST=1\n# @@newbie-framework-start\nX=1\n# @@newbie-framework-end\n",
      "utf8",
    );
    await fs.writeFile(path.join(project, ".env.example"), "HOST=1\n", "utf8");
    await assert.rejects(
      runTemplateUpdate({ cwd: project, templatePath: template, check: true, dryRun: false }),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /drift from the template/);
        return true;
      },
    );
  });
});
