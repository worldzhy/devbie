import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { moduleImportLine, normalizeModuleManifest } from "../src/core/module-manifest";

const valid = {
  key: "account",
  layer: "capability",
  wiring: {
    file: "account.module",
    className: "AccountModule",
    prismaSchema: "prisma/schema.prisma",
  },
  requires: {
    modules: ["security"],
    env: { ACCOUNT_SECRET: "<PLEASE_SET_THIS_VALUE>" },
  },
};

describe("normalizeModuleManifest", () => {
  it("accepts a well-formed manifest", () => {
    const manifest = normalizeModuleManifest(valid);
    assert.equal(manifest.key, "account");
    assert.equal(manifest.wiring.className, "AccountModule");
    assert.equal(manifest.wiring.prismaSchema, "prisma/schema.prisma");
    assert.equal(manifest.layer, "capability");
  });

  it("rejects non-objects and missing keys", () => {
    assert.throws(() => normalizeModuleManifest(null), /object/);
    assert.throws(() => normalizeModuleManifest({ ...valid, key: "" }), /key/);
  });

  it("rejects incomplete wiring", () => {
    assert.throws(
      () => normalizeModuleManifest({ key: "a", wiring: { file: "a" } }),
      /wiring\.file and wiring\.className/,
    );
  });

  it("rejects non-object wiring", () => {
    assert.throws(() => normalizeModuleManifest({ key: "a", wiring: "nope" }), /wiring.*object/);
    assert.throws(() => normalizeModuleManifest({ key: "a", wiring: [] }), /wiring.*object/);
  });

  it("rejects unknown wiring fields (strict whitelist)", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, wiring: { ...valid.wiring, legacy: true } }),
      /wiring\.legacy is not supported/,
    );
  });

  it("enforces the expected directory key", () => {
    assert.throws(() => normalizeModuleManifest(valid, "workflow"), /does not match directory/);
  });

  it("accepts wiring.newbieCli as optional CLI namespace", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      wiring: { ...valid.wiring, newbieCli: "secrets" },
    });
    assert.equal(manifest.wiring.newbieCli, "secrets");
    assert.equal(normalizeModuleManifest(valid).wiring.newbieCli, undefined);
  });

  it("rejects a non-string or empty wiring.newbieCli", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, wiring: { ...valid.wiring, newbieCli: 42 } }),
      /'wiring.newbieCli' must be a non-empty string/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, wiring: { ...valid.wiring, newbieCli: "" } }),
      /'wiring.newbieCli' must be a non-empty string/,
    );
  });

  it("normalises requires.modules (trim, dedupe) and leaves requires absent when undeclared", () => {
    const withDeps = normalizeModuleManifest({
      ...valid,
      requires: { modules: [" audit", "audit", "security"] },
    });
    assert.deepEqual(withDeps.requires?.modules, ["audit", "security"]);
    assert.equal(
      normalizeModuleManifest({ key: "a", wiring: { file: "a.module", className: "AModule" } }).requires,
      undefined,
    );
  });

  it("rejects malformed requires.modules", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { modules: "audit" } }),
      /requires.modules must be an array/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { modules: ["audit", ""] } }),
      /non-empty strings/,
    );
  });

  it("accepts a collector with a peerSdk string", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      collector: { peerSdk: "@devbie/heartbeat-sdk" },
    });
    assert.deepEqual(manifest.collector, { peerSdk: "@devbie/heartbeat-sdk" });
  });

  it("accepts a collector with peerSdk null (SDK not yet published)", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      collector: { peerSdk: null },
    });
    assert.deepEqual(manifest.collector, { peerSdk: null });
  });

  it("rejects collector with non-string-or-null peerSdk", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, collector: { peerSdk: false } }),
      /collector\.peerSdk must be a non-empty string or null/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, collector: { peerSdk: "" } }),
      /collector\.peerSdk must be a non-empty string or null/,
    );
  });

  it("rejects collector that is not an object", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, collector: "nope" }), /'collector' must be an object/);
  });

  it("rejects collector with wrong shape (not exactly one peerSdk key)", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, collector: {} }),
      /collector must contain exactly one key 'peerSdk'/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, collector: { peerSdk: "x", extra: true } }),
      /collector must contain exactly one key 'peerSdk'/,
    );
  });

  it("rejects unknown top-level fields (strict whitelist)", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, legacyField: true }),
      /unknown top-level field 'legacyField'/,
    );
  });

  it("rejects unknown requires fields (strict whitelist)", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { unknown: 42 } }),
      /requires.unknown is not supported/,
    );
  });

  it("preserves typed env declarations with an example value", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      requires: {
        env: { ACCOUNT_SECRET: "<PLEASE_SET_THIS_VALUE>", RETENTION: { type: "int", example: 30 } },
      },
    });
    assert.deepEqual(manifest.requires?.env, {
      ACCOUNT_SECRET: "<PLEASE_SET_THIS_VALUE>",
      RETENTION: { type: "int", example: 30 },
    });
  });

  it("rejects a requires.config reference to an env key the manifest never declares", () => {
    assert.throws(
      () =>
        normalizeModuleManifest({
          ...valid,
          requires: {
            env: { DECLARED_KEY: { example: "x" } },
            config: { apiKey: "process.env.UNDECLARED_KEY" },
          },
        }),
      /requires\.config references environment variable\(s\) 'env' does not declare: UNDECLARED_KEY/,
    );
  });

  it("accepts a requires.config whose references are all declared in env", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      requires: {
        env: { API_KEY: { example: "x" }, PORT: { type: "int" } },
        config: { apiKey: "process.env.API_KEY", port: "process.env.PORT" },
      },
    });
    assert.deepEqual(Object.keys(manifest.requires?.env ?? {}), ["API_KEY", "PORT"]);
  });

  it("collects env references from nested requires.config values", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      requires: {
        env: { A: { example: "x" }, B: { example: "y" } },
        config: { nested: { list: ["process.env.A", "process.env.B"] } },
      },
    });
    assert.equal(manifest.key, "account");
  });

  it("rejects a nested requires.config reference to an undeclared key", () => {
    assert.throws(
      () =>
        normalizeModuleManifest({
          ...valid,
          requires: {
            env: { A: { example: "x" } },
            config: { nested: { list: ["process.env.A", "process.env.MISSING"] } },
          },
        }),
      /requires\.config references environment variable\(s\) 'env' does not declare: MISSING/,
    );
  });

  it("rejects the pre-ADR-033 'default' env field in favour of 'example'", () => {
    assert.throws(
      () =>
        normalizeModuleManifest({
          ...valid,
          requires: { env: { RETENTION: { type: "int", default: 30 } } },
        }),
      /declares unsupported field 'default'.*renamed to 'example'/,
    );
  });

  it("rejects malformed env declarations", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, requires: { env: [] } }), /'env' must map variable names/);
    assert.throws(() => normalizeModuleManifest({ ...valid, requires: { env: { "": "x" } } }), /empty variable name/);
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { env: { A: 42 } } }),
      /must be a string or an object/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { env: { A: { type: "", example: "x" } } } }),
      /'env 'A'\.type' must be a non-empty string/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { env: { A: { example: { nested: 1 } } } } }),
      /\.example must be a string, number or boolean/,
    );
  });

  it("rejects a non-object requires", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, requires: "nope" }), /'requires' must be an object/);
  });

  it("accepts requires.dependencies and devDependencies as string maps", () => {
    const manifest = normalizeModuleManifest({
      ...valid,
      requires: {
        dependencies: { "@nestjs/event-emitter": "latest" },
        devDependencies: { "@types/node": "^22" },
      },
    });
    assert.deepEqual(manifest.requires?.dependencies, { "@nestjs/event-emitter": "latest" });
    assert.deepEqual(manifest.requires?.devDependencies, { "@types/node": "^22" });
  });

  it("rejects malformed requires.dependencies", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { dependencies: "nope" } }),
      /requires\.dependencies.*must be a string/,
    );
    assert.throws(
      () => normalizeModuleManifest({ ...valid, requires: { dependencies: { pkg: "" } } }),
      /requires\.dependencies\.pkg.*non-empty string/,
    );
  });

  it("validates layer against the known enumeration", () => {
    assert.throws(() => normalizeModuleManifest({ ...valid, layer: "observer" }), /'layer' must be one of datastore/);
  });

  it("rejects a non-string or empty deprecated", () => {
    assert.throws(
      () => normalizeModuleManifest({ ...valid, deprecated: 42 }),
      /'deprecated' must be a non-empty string/,
    );
  });
});

describe("moduleImportLine", () => {
  it("points at the copied directory and manifest wiring.file", () => {
    assert.equal(
      moduleImportLine("account", normalizeModuleManifest(valid)),
      "import {AccountModule} from './account/account.module';",
    );
  });
});
