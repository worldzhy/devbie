import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { resolveTemplate, runCreate } from "../src/commands/create";
import { parseModuleSelector } from "../src/lib/module-selector";

describe("resolveTemplate", () => {
  it("resolves a relative template path against the project cwd (R20-29)", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-template-cwd-"));
    after(async () => fs.rm(parent, { recursive: true, force: true }));
    const template = path.join(parent, "templates", "basic");
    await fs.mkdir(template, { recursive: true });
    await fs.writeFile(path.join(template, "package.json"), "{}");

    const resolved = await resolveTemplate({ templatePath: "./templates/basic", cwd: parent });

    assert.equal(resolved.root, template);
  });
});

describe("runCreate", () => {
  it("copies a project without the template repository's registry-completeness gate", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-create-parent-"));
    const template = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-create-template-"));
    after(async () => {
      await fs.rm(parent, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await fs.writeFile(
      path.join(template, "package.json"),
      JSON.stringify(
        {
          name: "newbie-basic-template",
          scripts: {
            "check:template": "NEWBIE_TEMPLATE_REGISTRY_COMPLETE=1 newbie template update --check --template-path .",
          },
        },
        null,
        2,
      ),
    );

    await runCreate({ name: "my-app", cwd: parent, gitInit: false, templatePath: template });

    const pkg = JSON.parse(await fs.readFile(path.join(parent, "my-app", "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    // A created project owns business files that are not template assets, so
    // its copied gate must stay green after `newbie modules add` (R5-11) — and
    // it must not point `--template-path` at the template checkout, which would
    // compare the project with itself and hide real drift (R6-15).
    assert.equal(pkg.scripts?.["check:template"], "newbie template update --check");
  });

  it("strips the '=' form of --template-path from a fewbie project", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-create-parent-"));
    const template = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-create-template-"));
    after(async () => {
      await fs.rm(parent, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await fs.writeFile(
      path.join(template, "package.json"),
      JSON.stringify(
        {
          name: "fewbie-basic-template",
          scripts: {
            "check:template": "FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1 fewbie template update --check --template-path=.",
          },
        },
        null,
        2,
      ),
    );

    await runCreate({ name: "my-web-app", cwd: parent, gitInit: false, templatePath: template });

    const pkg = JSON.parse(await fs.readFile(path.join(parent, "my-web-app", "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    assert.equal(pkg.scripts?.["check:template"], "fewbie template update --check");
  });
});

describe("parseModuleSelector", () => {
  it("returns undefined when no positional selector is given", () => {
    assert.equal(parseModuleSelector(undefined), undefined);
    assert.equal(parseModuleSelector([]), undefined);
  });

  it("splits comma and space separated chunks and dedupes", () => {
    assert.deepEqual(parseModuleSelector(["a,b", " c ", "d,e", "a"]), ["a", "b", "c", "d", "e"]);
  });

  it("drops empty chunks", () => {
    assert.deepEqual(parseModuleSelector(["", ",", " a ,,"]), ["a"]);
  });
});
