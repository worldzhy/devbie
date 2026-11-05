import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { moduleImportLine, normalizeModuleManifest } from "../src/core/module-manifest";

const valid = {
  key: "account",
  module: { file: "account.module", className: "AccountModule" },
  schema: "prisma/schema.prisma",
  env: { ACCOUNT_SECRET: "<PLEASE_SET_THIS_VALUE>" },
};

describe("normalizeModuleManifest", () => {
  it("accepts a well-formed manifest", () => {
    const manifest = normalizeModuleManifest(valid);
    assert.equal(manifest.key, "account");
    assert.equal(manifest.module.className, "AccountModule");
    assert.equal(manifest.schema, "prisma/schema.prisma");
  });

  it("rejects non-objects and missing keys", () => {
    assert.throws(() => normalizeModuleManifest(null), /object/);
    assert.throws(() => normalizeModuleManifest({ ...valid, key: "" }), /key/);
  });

  it("rejects incomplete module wiring", () => {
    assert.throws(
      () => normalizeModuleManifest({ key: "a", module: { file: "a" } }),
      /module\.file and module\.className/,
    );
  });

  it("enforces the expected directory key", () => {
    assert.throws(() => normalizeModuleManifest(valid, "workflow"), /does not match directory/);
  });

  it("drops a non-string schema field", () => {
    const manifest = normalizeModuleManifest({ ...valid, schema: 42 });
    assert.equal(manifest.schema, undefined);
  });

  it("normalises moduleDependencies (trim, dedupe) and leaves it absent when undeclared", () => {
    const withDeps = normalizeModuleManifest({
      ...valid,
      moduleDependencies: [" audit", "audit", "security"],
    });
    assert.deepEqual(withDeps.moduleDependencies, ["audit", "security"]);
    assert.equal(normalizeModuleManifest(valid).moduleDependencies, undefined);
  });

  it("rejects malformed moduleDependencies", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, moduleDependencies: "audit" }),
      /moduleDependencies must be an array/,
    );
    assert.throws(() => normalizeModuleManifest({ ...valid, moduleDependencies: ["audit", ""] }), /non-empty strings/);
  });

  it("preserves an optional 'cli' namespace string", () => {
    const manifest = normalizeModuleManifest({ ...valid, cli: "secrets" });
    assert.equal(manifest.cli, "secrets");
    assert.equal(normalizeModuleManifest(valid).cli, undefined);
  });

  it("rejects a non-string or empty 'cli' field", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, cli: 42 }), /'cli' must be a non-empty string/);
    assert.throws(() => normalizeModuleManifest({ ...valid, cli: "" }), /'cli' must be a non-empty string/);
  });

  it("preserves an optional 'sdk' package name string", () => {
    const manifest = normalizeModuleManifest({ ...valid, sdk: "@devbie/heartbeat-sdk" });
    assert.equal(manifest.sdk, "@devbie/heartbeat-sdk");
    assert.equal(normalizeModuleManifest(valid).sdk, undefined);
  });

  it("rejects a non-string or empty 'sdk' field", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, sdk: false }), /'sdk' must be a non-empty string/);
    assert.throws(() => normalizeModuleManifest({ ...valid, sdk: "" }), /'sdk' must be a non-empty string/);
  });

  it("preserves an optional 'role' of 'collector' and leaves it absent by default", () => {
    const manifest = normalizeModuleManifest({ ...valid, role: "collector" });
    assert.equal(manifest.role, "collector");
    assert.equal(normalizeModuleManifest(valid).role, undefined);
  });

  it("rejects an unknown or non-string 'role'", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, role: "observer" }), /'role' must be one of/);
    assert.throws(() => normalizeModuleManifest({ ...valid, role: 42 }), /'role' must be one of/);
  });

  it("preserves an optional 'publicNamespace' boolean and leaves it absent by default", () => {
    const manifest = normalizeModuleManifest({ ...valid, publicNamespace: true });
    assert.equal(manifest.publicNamespace, true);
    assert.equal(normalizeModuleManifest(valid).publicNamespace, undefined);
  });

  it("preserves typed env declarations with an example value", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      env: { ACCOUNT_SECRET: "<PLEASE_SET_THIS_VALUE>", RETENTION: { type: "int", example: 30 } },
    });
    assert.deepEqual(manifest.env, {
      ACCOUNT_SECRET: "<PLEASE_SET_THIS_VALUE>",
      RETENTION: { type: "int", example: 30 },
    });
    assert.equal(normalizeModuleManifest({ ...valid, env: undefined }).env, undefined);
  });

  it("rejects a config-service reference to an env key the manifest never declares", () => {
    assert.throws(
      () =>
        normalizeModuleManifest({
          ...valid,
          env: { DECLARED_KEY: { example: "x" } },
          "config-service": { apiKey: "process.env.UNDECLARED_KEY" },
        }),
      /config-service references environment variable\(s\) 'env' does not declare: UNDECLARED_KEY/,
    );
  });

  it("accepts a config-service whose references are all declared in env", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      env: { API_KEY: { example: "x" }, PORT: { type: "int" } },
      "config-service": { apiKey: "process.env.API_KEY", port: "process.env.PORT" },
    });
    assert.deepEqual(Object.keys(manifest.env ?? {}), ["API_KEY", "PORT"]);
  });

  it("collects env references from nested config-service values", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      env: { A: { example: "x" }, B: { example: "y" } },
      "config-service": { nested: { list: ["process.env.A", "process.env.B"] } },
    });
    assert.equal(manifest.key, "account");
  });

  it("rejects a nested config-service reference to an undeclared key", () => {
    assert.throws(
      () =>
        normalizeModuleManifest({
          ...valid,
          env: { A: { example: "x" } },
          "config-service": { nested: { list: ["process.env.A", "process.env.MISSING"] } },
        }),
      /config-service references environment variable\(s\) 'env' does not declare: MISSING/,
    );
  });

  it("rejects the pre-ADR-033 'default' env field in favour of 'example'", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, env: { RETENTION: { type: "int", default: 30 } } }),
      /declares unsupported field 'default'.*renamed to 'example'/,
    );
  });

  it("rejects malformed env declarations", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, env: [] }), /'env' must map variable names/);
    assert.throws(() => normalizeModuleManifest({ ...valid, env: { "": "x" } }), /empty variable name/);
    assert.throws(() => normalizeModuleManifest({ ...valid, env: { A: 42 } }), /must be a string or an object/);
    assert.throws(
      () => normalizeModuleManifest({ ...valid, env: { A: { type: "", example: "x" } } }),
      /'env 'A'\.type' must be a non-empty string/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, env: { A: { example: { nested: 1 } } } }),
      /\.example must be a string, number or boolean/,
    );
  });

  it("rejects a non-boolean 'publicNamespace'", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, publicNamespace: "true" }),
      /'publicNamespace' must be a boolean/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, publicNamespace: 1 }),
      /'publicNamespace' must be a boolean/,
    );
  });
});

describe("moduleImportLine", () => {
  it("points at the copied directory and manifest module file", () => {
    assert.equal(
      moduleImportLine("account", normalizeModuleManifest(valid)),
      "import {AccountModule} from './account/account.module';",
    );
  });
});
