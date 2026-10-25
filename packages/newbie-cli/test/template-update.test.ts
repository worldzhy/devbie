import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractMarkerBlock,
  findUnclassifiedTemplateFiles,
  frameworkMarkers,
  isUpdatableTemplateFile,
  planTemplateUpdate,
  replaceMarkerBlock,
  TEMPLATE_FILES,
  TemplateFile,
} from "../src/core/template-update";

const SLASH = "//";
const HASH = "#";

function frameworkBlock(syntax: "//" | "#" = SLASH): string {
  const markers = frameworkMarkers(syntax);
  return `${markers.start}\nFRAMEWORK BODY\n${markers.end}`;
}

const PRISMA_BLOCK = `${frameworkMarkers(SLASH).start}
datasource db {
  provider = "postgresql"
  schemas  = ["application"]
}
${frameworkMarkers(SLASH).end}`;

const TEMPLATE_CONTENT: Readonly<Record<string, string>> = {
  ".env.example": `HOST=1\n${frameworkBlock(HASH)}\n`,
  ".gitignore": `${frameworkBlock(HASH)}\nHOST_IGNORE\n`,
  "prisma/schema.prisma": `// header\n${PRISMA_BLOCK}\nmodel User {\n  id Int @id\n}\n`,
  "deploy/Caddyfile.tmpl": `site {\n# @@newbie-modules-start\n# @@newbie-modules-end\n}\n`,
};

function templateContentFor(file: TemplateFile): string {
  return TEMPLATE_CONTENT[file.path] ?? `// ${file.path}\n`;
}

/** Full-content maps where project and template are identical. */
function identicalMaps(): {
  project: Map<string, string | null>;
  template: Map<string, string | null>;
} {
  const project = new Map<string, string | null>();
  const template = new Map<string, string | null>();
  for (const file of TEMPLATE_FILES) {
    const content = templateContentFor(file);
    project.set(file.path, content);
    template.set(file.path, content);
  }
  return { project, template };
}

describe("TEMPLATE_FILES ownership registry (ADR-009 D4)", () => {
  it("classifies every shipped template file exactly once", () => {
    assert.equal(TEMPLATE_FILES.length, 33);
    const paths = TEMPLATE_FILES.map((file) => file.path);
    assert.equal(new Set(paths).size, paths.length, "duplicate registry path");
  });

  it("carries the documented per-ownership counts", () => {
    const count = (ownership: string) => TEMPLATE_FILES.filter((f) => f.ownership === ownership).length;
    assert.equal(count("framework-whole-file"), 13);
    assert.equal(count("framework-marker-block"), 3);
    assert.equal(count("generated"), 3);
    assert.equal(count("template-shipped-host-owned"), 14);
  });

  it("ships the framework deploy stack as whole-file entries", () => {
    const deployPaths = TEMPLATE_FILES.filter(
      (f) => f.path.startsWith("deploy/") && f.ownership === "framework-whole-file",
    ).map((f) => f.path);
    assert.deepEqual(deployPaths, [
      "deploy/compose.framework.yml",
      "deploy/Caddyfile.tmpl",
      "deploy/scripts/lib.sh",
      "deploy/scripts/render-env.sh",
      "deploy/scripts/deploy.sh",
      "deploy/scripts/start.sh",
      "deploy/scripts/backup.sh",
      "deploy/scripts/provision.sh",
    ]);
  });

  it("declares a marker syntax for every marker-block entry", () => {
    for (const file of TEMPLATE_FILES.filter((f) => f.ownership === "framework-marker-block")) {
      assert.ok(file.markerSyntax === "//" || file.markerSyntax === "#", `${file.path} lacks markerSyntax`);
    }
  });

  it("keeps generated and host-owned files out of the update plan", () => {
    const { project, template } = identicalMaps();
    project.set("package.json", '{ "host": true }\n');
    project.set("src/modules/modules.module.ts", "// regenerated\n");
    project.set("deploy/compose.modules.yml", "services: {}\n");
    assert.deepEqual(planTemplateUpdate(project, template), []);
  });

  it("lists unclassified template files (unlisted = error)", () => {
    const classified = TEMPLATE_FILES.map((file) => file.path);
    assert.deepEqual(findUnclassifiedTemplateFiles(classified), []);
    assert.deepEqual(findUnclassifiedTemplateFiles([...classified, "docs/new.md", "a/b.txt"]), [
      "a/b.txt",
      "docs/new.md",
    ]);
  });
});

describe("extractMarkerBlock", () => {
  it("supports the // syntax of prisma/schema.prisma", () => {
    assert.equal(extractMarkerBlock(`header\n${frameworkBlock(SLASH)}\n`, SLASH), frameworkBlock(SLASH));
  });

  it("supports the # syntax of .env.example / .gitignore", () => {
    assert.equal(extractMarkerBlock(`header\n${frameworkBlock(HASH)}\n`, HASH), frameworkBlock(HASH));
  });

  it("returns null when a marker is missing or inverted", () => {
    const markers = frameworkMarkers(HASH);
    assert.equal(extractMarkerBlock("no markers here", HASH), null);
    assert.equal(extractMarkerBlock(`${markers.end}\n${markers.start}`, HASH), null);
  });

  it("rejects a file whose markers use the other syntax", () => {
    assert.equal(extractMarkerBlock(frameworkBlock(SLASH), HASH), null);
  });
});

describe("replaceMarkerBlock", () => {
  it("replaces only the block and preserves host content", () => {
    const content = `HOST=1\n${frameworkBlock(HASH)}\nHOST=2\n`;
    const next = replaceMarkerBlock(content, `${frameworkBlock(HASH)}\nNEXT`, HASH);
    assert.ok(next !== null);
    assert.match(next, /HOST=1/);
    assert.match(next, /HOST=2/);
    assert.match(next, /NEXT/);
  });

  it("returns null when the project file has no markers", () => {
    assert.equal(replaceMarkerBlock("HOST=1\n", frameworkBlock(HASH), HASH), null);
  });
});

describe("planTemplateUpdate", () => {
  it("is empty when project matches the template", () => {
    const { project, template } = identicalMaps();
    assert.deepEqual(planTemplateUpdate(project, template), []);
  });

  it("flags differing whole-file entries as update", () => {
    const { project, template } = identicalMaps();
    project.set("tsconfig.json", '{ "old": true }\n');
    const changes = planTemplateUpdate(project, template);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].file.path, "tsconfig.json");
    assert.equal(changes[0].kind, "update");
    assert.equal(changes[0].nextContent, template.get("tsconfig.json"));
  });

  it("flags template files missing from the project as create", () => {
    const { project, template } = identicalMaps();
    project.set("nest-cli.json", null);
    const changes = planTemplateUpdate(project, template);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "create");
    assert.equal(changes[0].currentComparable, null);
  });

  it("skips files the template no longer ships", () => {
    const { project, template } = identicalMaps();
    template.set("tsconfig.build.json", null);
    assert.deepEqual(planTemplateUpdate(project, template), []);
  });

  it("updates only the framework block of .env.example and preserves host variables", () => {
    const { project, template } = identicalMaps();
    project.set(".env.example", `HOST_ONLY=1\n${frameworkBlock(HASH)}\n`);
    assert.deepEqual(planTemplateUpdate(project, template), []);

    project.set(".env.example", `HOST_ONLY=1\n${frameworkMarkers(HASH).start}\nSTALE\n${frameworkMarkers(HASH).end}\n`);
    const changes = planTemplateUpdate(project, template);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "update");
    assert.match(changes[0].nextContent ?? "", /HOST_ONLY=1/);
    assert.match(changes[0].nextContent ?? "", /FRAMEWORK BODY/);
    assert.doesNotMatch(changes[0].nextContent ?? "", /STALE/);
  });

  it("reports missing-markers when a project block file lost its markers", () => {
    const { project, template } = identicalMaps();
    project.set(".gitignore", "/dist\n");
    const changes = planTemplateUpdate(project, template);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "missing-markers");
    assert.equal(changes[0].nextContent, null);
  });

  it("normalizes the assembly-rendered schemas line of prisma/schema.prisma", () => {
    const { project, template } = identicalMaps();
    // Different module namespaces are rendered by reconcileDatasourceSchemas.
    const projectBlock = PRISMA_BLOCK.replace(
      'schemas  = ["application"]',
      'schemas  = ["application", "module/account"]',
    );
    project.set("prisma/schema.prisma", `// header\n${projectBlock}\nmodel Order {\n  id Int @id\n}\n`);
    assert.deepEqual(planTemplateUpdate(project, template), []);
  });

  it("preserves the project's schemas line when the framework block drifts", () => {
    const { project, template } = identicalMaps();
    const projectBlock = PRISMA_BLOCK.replace('provider = "postgresql"', 'provider = "sqlite"').replace(
      'schemas  = ["application"]',
      'schemas  = ["application", "module/account"]',
    );
    project.set("prisma/schema.prisma", `// header\n${projectBlock}\nmodel Order {\n  id Int @id\n}\n`);
    const changes = planTemplateUpdate(project, template);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "update");
    const next = changes[0].nextContent ?? "";
    assert.match(next, /provider = "postgresql"/);
    assert.match(next, /schemas  = \["application", "module\/account"\]/);
    assert.match(next, /model Order \{/);
  });

  it("ignores the assemble-rendered module block of deploy/Caddyfile.tmpl", () => {
    const { project, template } = identicalMaps();
    const rendered = `site {\n# @@newbie-modules-start\n\thandle /web-monitor/* {\n\t\treverse_proxy backend:3000\n\t}\n# @@newbie-modules-end\n}\n`;
    project.set("deploy/Caddyfile.tmpl", rendered);
    assert.deepEqual(planTemplateUpdate(project, template), []);
  });

  it("preserves the project's module block when the Caddyfile static part drifts", () => {
    const { project, template } = identicalMaps();
    const rendered = `site {\n# @@newbie-modules-start\n\thandle /web-monitor/* {\n\t\treverse_proxy backend:3000\n\t}\n# @@newbie-modules-end\n}\n`;
    project.set("deploy/Caddyfile.tmpl", `${rendered}\n# host comment\n`);
    const changes = planTemplateUpdate(project, template);
    assert.equal(changes.length, 1);
    const next = changes[0].nextContent ?? "";
    assert.match(next, /handle \/web-monitor\/\*/);
  });

  it("throws when the template marker block is malformed", () => {
    const { project, template } = identicalMaps();
    template.set(".env.example", "HOST=1\n");
    assert.throws(() => planTemplateUpdate(project, template), /framework block/i);
  });

  it("is idempotent: applying the plan yields an empty follow-up plan", () => {
    const { project, template } = identicalMaps();
    project.set("src/main.ts", "// stale main\n");
    project.set("tsconfig.json", null);
    project.set(".env.example", `HOST=1\n${frameworkMarkers(HASH).start}\nSTALE\n${frameworkMarkers(HASH).end}\n`);
    project.set(
      "prisma/schema.prisma",
      `// header\n${PRISMA_BLOCK.replace('provider = "postgresql"', 'provider = "sqlite"').replace(
        'schemas  = ["application"]',
        'schemas  = ["application", "module/account"]',
      )}\nmodel Order {\n  id Int @id\n}\n`,
    );
    const changes = planTemplateUpdate(project, template);
    assert.equal(changes.length, 4);
    for (const change of changes) {
      assert.ok(change.nextContent !== null);
      project.set(change.file.path, change.nextContent);
    }
    assert.deepEqual(planTemplateUpdate(project, template), []);
  });

  it("is updatable only for framework ownership classes", () => {
    const updatable = TEMPLATE_FILES.filter(isUpdatableTemplateFile).map((file) => file.path);
    assert.ok(updatable.includes("src/main.ts"));
    assert.ok(updatable.includes(".env.example"));
    assert.ok(!updatable.includes("package.json"));
    assert.ok(!updatable.includes("deploy/compose.modules.yml"));
  });
});
