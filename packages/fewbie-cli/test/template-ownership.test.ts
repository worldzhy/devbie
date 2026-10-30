import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractMarkerBlock,
  FRAMEWORK_MARKER_END,
  FRAMEWORK_MARKER_START,
  planTemplateUpdate,
  replaceMarkerBlock,
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
