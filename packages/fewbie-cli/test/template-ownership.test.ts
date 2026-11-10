import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assetCoversPath,
  assetMarkers,
  extractMarkerBlock,
  findUnclassifiedTemplateFiles,
  FRAMEWORK_DEPENDENCIES,
  FRAMEWORK_MARKER_END,
  FRAMEWORK_MARKER_START,
  isTemplateScanIgnored,
  planTemplateUpdate,
  replaceMarkerBlock,
  TEMPLATE_ASSETS,
  TemplateAsset,
} from "../src/lib/template-ownership";

const frameworkAsset: TemplateAsset = { path: "next.config.ts", ownership: "framework" };
const mixedAsset: TemplateAsset = { path: "src/app/globals.css", ownership: "mixed" };

const HTML_MARKERS = { start: "<!-- fewbie:framework:start -->", end: "<!-- fewbie:framework:end -->" };
const agentsAsset: TemplateAsset = { path: "AGENTS.md", ownership: "mixed", markers: HTML_MARKERS };

function globalsCss(block: string, host = ":root { --host: 1; }"): string {
  return `@import "tailwindcss";\n\n${host}\n\n${FRAMEWORK_MARKER_START}\n${block}\n${FRAMEWORK_MARKER_END}\n`;
}

function agentsMd(block: string, host = "# Project notes"): string {
  return `# Agents\n\n${HTML_MARKERS.start}\n${block}\n${HTML_MARKERS.end}\n\n${host}\n`;
}

describe("ownership registry completeness (ADR-025)", () => {
  it("matches whole subtrees and exact files", () => {
    const components: TemplateAsset = { path: "src/components/**", ownership: "host" };
    assert.ok(assetCoversPath(components, "src/components/ui/button.tsx"));
    assert.ok(assetCoversPath(components, "src/components"));
    assert.ok(!assetCoversPath(components, "src/components.md"));
    assert.ok(assetCoversPath(frameworkAsset, "next.config.ts"));
    assert.ok(!assetCoversPath(frameworkAsset, "next.config.mjs"));
  });

  it("lists template files missing from the registry", () => {
    assert.deepEqual(findUnclassifiedTemplateFiles(["next.config.ts", "src/components/ui/button.tsx"]), []);
    assert.deepEqual(findUnclassifiedTemplateFiles(["docs/new.md", "src/orphan.ts"]), ["docs/new.md", "src/orphan.ts"]);
  });

  it("keeps runtime output and per-project files out of the guard", () => {
    for (const ignored of [".next/server/app.js", "node_modules/pkg/index.js", "backlog.md", "package-lock.json"]) {
      assert.ok(isTemplateScanIgnored(ignored), `${ignored} must stay out of the guard`);
    }
    for (const shipped of ["Dockerfile", ".github/workflows/ci.yml", "src/i18n/config.ts"]) {
      assert.ok(!isTemplateScanIgnored(shipped), `${shipped} must remain classified`);
    }
  });
});

describe("marker blocks", () => {
  it("extracts the block including its markers", () => {
    const block = extractMarkerBlock(globalsCss("--primary: red;"));
    assert.equal(block, `${FRAMEWORK_MARKER_START}\n--primary: red;\n${FRAMEWORK_MARKER_END}`);
  });

  it("returns null when either marker is missing", () => {
    assert.equal(extractMarkerBlock(":root { --primary: red; }"), null);
    assert.equal(extractMarkerBlock(`${FRAMEWORK_MARKER_START}\n--primary: red;`), null);
  });

  it("replaces only the marked block", () => {
    const content = globalsCss("--primary: old;", ":root { --host: 42; }");
    const replaced = replaceMarkerBlock(content, `${FRAMEWORK_MARKER_START}\n--primary: new;\n${FRAMEWORK_MARKER_END}`);
    assert.ok(replaced !== null);
    assert.match(replaced, /--primary: new;/);
    assert.match(replaced, /--host: 42;/);
  });

  it("honors a per-asset marker pair", () => {
    const content = agentsMd("Use the CLI.");
    const block = extractMarkerBlock(content, HTML_MARKERS);
    assert.equal(block, `${HTML_MARKERS.start}\nUse the CLI.\n${HTML_MARKERS.end}`);
    // The default CSS markers do not match an HTML-marked file.
    assert.equal(extractMarkerBlock(content), null);
  });
});

describe("framework dependencies (ADR-025)", () => {
  it("declares next-intl with a non-empty required-by note", () => {
    const nextIntl = FRAMEWORK_DEPENDENCIES.find((dependency) => dependency.name === "next-intl");
    assert.ok(nextIntl, "next-intl must be declared as a framework dependency");
    assert.match(nextIntl.importedBy, /next\.config\.ts/);
  });

  it("keeps every entry well-formed and unique", () => {
    const names = FRAMEWORK_DEPENDENCIES.map((dependency) => dependency.name);
    for (const dependency of FRAMEWORK_DEPENDENCIES) {
      assert.ok(dependency.name.trim().length > 0, "name must be non-empty");
      assert.ok(dependency.importedBy.trim().length > 0, "importedBy must be non-empty");
    }
    assert.deepEqual(names, [...new Set(names)], "dependency names must be unique");
    assert.ok(!names.includes("next"), "next is the project baseline, not a framework dependency");
  });
});

describe("planTemplateUpdate", () => {
  it("creates a framework file missing from the project", () => {
    const changes = planTemplateUpdate(new Map([["next.config.ts", null]]), new Map([["next.config.ts", "template"]]), [
      frameworkAsset,
    ]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "create");
    assert.equal(changes[0].nextContent, "template");
  });

  it("updates a framework file that differs", () => {
    const changes = planTemplateUpdate(new Map([["next.config.ts", "old"]]), new Map([["next.config.ts", "new"]]), [
      frameworkAsset,
    ]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "update");
    assert.equal(changes[0].nextContent, "new");
  });

  it("leaves matching framework files alone", () => {
    const changes = planTemplateUpdate(new Map([["next.config.ts", "same"]]), new Map([["next.config.ts", "same"]]), [
      frameworkAsset,
    ]);
    assert.deepEqual(changes, []);
  });

  it("updates only the marked block of a mixed file and keeps host content", () => {
    const changes = planTemplateUpdate(
      new Map([["src/app/globals.css", globalsCss("--primary: old;", ":root { --host: 42; }")]]),
      new Map([["src/app/globals.css", globalsCss("--primary: new;")]]),
      [mixedAsset],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "update");
    assert.match(changes[0].nextContent ?? "", /--primary: new;/);
    assert.match(changes[0].nextContent ?? "", /--host: 42;/);
    assert.ok((changes[0].nextContent ?? "").includes(FRAMEWORK_MARKER_START));
  });

  it("reports missing markers in the project copy instead of guessing", () => {
    const changes = planTemplateUpdate(
      new Map([["src/app/globals.css", ":root { --primary: old; }"]]),
      new Map([["src/app/globals.css", globalsCss("--primary: new;")]]),
      [mixedAsset],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "missing-markers");
    assert.equal(changes[0].nextContent, null);
  });

  it("updates only the custom-marked block of a mixed file and keeps host content", () => {
    const changes = planTemplateUpdate(
      new Map([["AGENTS.md", agentsMd("Old contract.")]]),
      new Map([["AGENTS.md", agentsMd("New contract.")]]),
      [agentsAsset],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "update");
    assert.match(changes[0].nextContent ?? "", /New contract\./);
    assert.match(changes[0].nextContent ?? "", /# Project notes/);
    assert.ok((changes[0].nextContent ?? "").includes(HTML_MARKERS.start));
  });

  it("reports a project AGENTS.md without the HTML markers instead of guessing", () => {
    const changes = planTemplateUpdate(
      new Map([["AGENTS.md", "# Agents\n\nHand-written notes.\n"]]),
      new Map([["AGENTS.md", agentsMd("New contract.")]]),
      [agentsAsset],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "missing-markers");
    assert.equal(changes[0].nextContent, null);
  });

  it("treats markers missing from the template itself as a template defect", () => {
    assert.throws(
      () =>
        planTemplateUpdate(
          new Map([["src/app/globals.css", globalsCss("--primary: old;")]]),
          new Map([["src/app/globals.css", ":root { --primary: new; }"]]),
          [mixedAsset],
        ),
      /missing the framework markers/,
    );
  });

  it("skips assets the template no longer ships", () => {
    const changes = planTemplateUpdate(new Map([["next.config.ts", "old"]]), new Map([["next.config.ts", null]]), [
      frameworkAsset,
    ]);
    assert.deepEqual(changes, []);
  });
});

describe("scaffold assets (ADR-035)", () => {
  const SCAFFOLD_PROJECT =
    'import { withFewbie } from "./next.config.framework";\n\nexport default withFewbie({ devIndicators: false });\n';
  const SCAFFOLD_TEMPLATE = 'import { withFewbie } from "./next.config.framework";\n\nexport default withFewbie({});\n';
  const scaffoldAsset: TemplateAsset = {
    path: "next.config.ts",
    ownership: "scaffold",
    requiredSnippet: 'from "./next.config.framework"',
  };

  it("creates a scaffold file missing from the project", () => {
    const changes = planTemplateUpdate(
      new Map([["next.config.ts", null]]),
      new Map([["next.config.ts", SCAFFOLD_TEMPLATE]]),
      [scaffoldAsset],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "create");
    assert.equal(changes[0].nextContent, SCAFFOLD_TEMPLATE);
  });

  it("never rewrites an adopted host copy, even when it differs from the template", () => {
    const changes = planTemplateUpdate(
      new Map([["next.config.ts", SCAFFOLD_PROJECT]]),
      new Map([["next.config.ts", SCAFFOLD_TEMPLATE]]),
      [scaffoldAsset],
    );
    assert.deepEqual(changes, []);
  });

  it("reports scaffold-outdated without an auto-fix when the entry point is missing", () => {
    const host = "export default { output: 'standalone' };\n";
    const changes = planTemplateUpdate(
      new Map([["next.config.ts", host]]),
      new Map([["next.config.ts", SCAFFOLD_TEMPLATE]]),
      [scaffoldAsset],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "scaffold-outdated");
    // Host adoption is manual: no content is ever proposed for writing.
    assert.equal(changes[0].nextContent, null);
    assert.equal(changes[0].currentComparable, null);
    assert.equal(changes[0].templateComparable, SCAFFOLD_TEMPLATE);
  });

  it("does not count a commented-out import as adopting the framework entry point", () => {
    const host = '// import { withFewbie } from "./next.config.framework";\nexport default {};\n';
    const changes = planTemplateUpdate(
      new Map([["next.config.ts", host]]),
      new Map([["next.config.ts", SCAFFOLD_TEMPLATE]]),
      [scaffoldAsset],
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "scaffold-outdated");
  });

  it("counts an import that carries a trailing comment", () => {
    const host = 'import { withFewbie } from "./next.config.framework"; // framework defaults\nexport default {};\n';
    const changes = planTemplateUpdate(
      new Map([["next.config.ts", host]]),
      new Map([["next.config.ts", SCAFFOLD_TEMPLATE]]),
      [scaffoldAsset],
    );
    assert.deepEqual(changes, []);
  });
});

describe("hash-commented mixed assets (ADR-035)", () => {
  const asciiMarkers = { start: "# fewbie:framework:start", end: "# fewbie:framework:end" };

  it("classifies .prettierignore and .env.example as mixed with # markers", () => {
    for (const filePath of [".prettierignore", ".env.example"]) {
      const asset = TEMPLATE_ASSETS.find((candidate) => candidate.path === filePath);
      assert.equal(asset?.ownership, "mixed", `${filePath} must be mixed`);
      assert.deepEqual(assetMarkers(asset as TemplateAsset), asciiMarkers);
    }
  });

  it("replaces only the # block and keeps host lines", () => {
    const asset = TEMPLATE_ASSETS.find((candidate) => candidate.path === ".prettierignore") as TemplateAsset;
    const project = `${asciiMarkers.start}\nnode_modules\n${asciiMarkers.end}\n\n.trae\n`;
    const template = `${asciiMarkers.start}\nnode_modules\n.next\n${asciiMarkers.end}\n`;

    const changes = planTemplateUpdate(new Map([[asset.path, project]]), new Map([[asset.path, template]]), [asset]);

    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "update");
    const next = changes[0].nextContent ?? "";
    assert.match(next, /\.next/);
    assert.match(next, /\.trae/);
  });
});
