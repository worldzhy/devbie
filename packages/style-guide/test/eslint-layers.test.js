import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import prettierConfig from "eslint-config-prettier";
import base from "../eslint/base.js";
import nest from "../eslint/nest.js";
import next from "../eslint/next.js";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

// Flat configs may nest arrays; the layers here spread third-party arrays, so
// every assertion walks the tree instead of assuming one level.
const flatten = (configs) => configs.flatMap((entry) => (Array.isArray(entry) ? flatten(entry) : [entry]));
const rulesOf = (layer) => flatten(layer).reduce((rules, entry) => ({ ...rules, ...(entry?.rules ?? {}) }), {});
const ruleIds = (layer) => Object.keys(rulesOf(layer));
// The layer that decides which rules survive composition is the last one that
// defines rules; trailing ignores-only entries (e.g. `next`'s globalIgnores)
// must not sit between the formatting shutdown and the consumer.
const lastRulesEntry = (layer) =>
  flatten(layer)
    .filter((entry) => entry.rules && Object.keys(entry.rules).length > 0)
    .at(-1);

describe("@devbie/style-guide published surface", () => {
  it("exports exactly the four public entries", () => {
    assert.deepEqual(Object.keys(pkg.exports).sort(), [
      "./eslint/base",
      "./eslint/nest",
      "./eslint/next",
      "./package.json",
      "./prettier",
    ]);
  });

  it("declares a files field that ships every entry", () => {
    assert.deepEqual(pkg.files, ["prettier.js", "eslint"]);
    assert.deepEqual(
      Object.keys(pkg.exports).filter((key) => key.startsWith("./eslint/")),
      ["./eslint/base", "./eslint/nest", "./eslint/next"],
    );
  });

  it("ships type declarations for every eslint entry", () => {
    // Consumers compose the layers from eslint.config.* files; without types
    // every IDE flags the central import as untyped. Each entry maps an
    // adjacent declaration alongside its JS module.
    for (const entry of ["./eslint/base", "./eslint/nest", "./eslint/next"]) {
      const target = pkg.exports[entry];
      assert.equal(typeof target, "object", `${entry} must map types + default`);
      assert.match(target.types, /\.d\.ts$/);
      assert.match(target.default, /\.js$/);
    }
  });

  it("declares next as an optional peer, tested against a devDependency copy", () => {
    // The next entry is only loadable where `next` exists, but a package-level
    // required peer would force base/nest consumers to install Next.js. The
    // optional peer documents the contract without forcing anything; the dev
    // dependency exists so this package's own test suite can load the layer.
    assert.equal(pkg.peerDependenciesMeta?.next?.optional, true);
    // Any Next.js 16 satisfies the contract; the dev dependency is the
    // version the test suite runs against, not the supported floor.
    assert.equal(pkg.peerDependencies.next, "^16.0.0");
    assert.equal(pkg.devDependencies.next, "^16.4.2");
  });
});

describe("eslint layers", () => {
  it("every layer ends on the formatting-rule shutdown", () => {
    for (const layer of [base, nest, next]) {
      assert.deepEqual(lastRulesEntry(layer), prettierConfig);
    }
  });

  it("base stays syntactic: no framework rules", () => {
    const frameworkPrefixes = ["@darraghor/", "@next/", "react/", "react-hooks/", "jsx-a11y/"];
    // eslint-config-prettier legitimately lists framework rules set to "off"
    // (its formatting shutdown); only an enabled framework rule would leak a
    // framework dependency into the baseline.
    const enabled = (value) => (Array.isArray(value) ? value[0] : value) !== "off";
    for (const [id, value] of Object.entries(rulesOf(base))) {
      if (!enabled(value)) continue;
      assert.ok(
        !frameworkPrefixes.some((prefix) => id.startsWith(prefix)),
        `base must not enable the framework rule ${id}; a framework rule belongs in its own layer`,
      );
    }
  });

  it("base ignores minified vendor bundles", () => {
    // Minified files are machine output — vendor bundles copied into a repo
    // (docs microsites under public/, for example). Linting them yields
    // thousands of meaningless violations, so the ignore lives in the shared
    // layer and consumers need not repeat it in their own config.
    assert.ok(flatten(base).some((entry) => entry.ignores?.includes("**/*.min.js")));
  });

  it("nest carries the typed Nest rules and requires a TypeScript project", () => {
    const ids = ruleIds(nest);
    assert.ok(ids.includes("@darraghor/nestjs-typed/injectable-should-be-provided"));
    assert.ok(
      flatten(nest).some((entry) => entry.languageOptions?.parserOptions?.projectService === true),
      "the typed Nest rules are type-aware, so the layer must enable parserOptions.projectService",
    );
  });

  it("next carries the Next.js rules", () => {
    assert.ok(ruleIds(next).some((id) => id.startsWith("@next/next/")));
  });

  it("lets consumers use the idiomatic array-literal default export", () => {
    // eslint-config-next bundles eslint-plugin-import, whose
    // no-anonymous-default-export warns on `export default [...]` — the
    // canonical flat-config idiom. The layer switches it off for config
    // files so consumers need no `const config = [...]; export default
    // config;` shim. Must stay scoped to config files; the rule is real
    // for application code.
    const configEntries = flatten(next).filter((entry) => entry.files?.includes("**/eslint.config.*"));
    assert.equal(configEntries.length, 1);
    assert.equal(configEntries[0].rules["import/no-anonymous-default-export"], "off");
  });

  it("every layer is a composable array of plain config objects", () => {
    for (const layer of [base, nest, next]) {
      assert.ok(Array.isArray(layer) && layer.length > 0);
      for (const entry of flatten(layer)) {
        assert.equal(typeof entry, "object");
      }
    }
  });
});
