import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInstallSpecs,
  type DependencyDecls,
  filterManagedRemovals,
  installSpecName,
  planDependencyInstalls,
  planDependencyRemovals,
} from "../src/core/dependency-plan";
import { sanitizeModuleNames } from "../src/core/module-manifest";

describe("sanitizeModuleNames", () => {
  const catalog = new Set(["account", "queue"]);

  it("trims, validates against the catalog and de-duplicates", () => {
    assert.deepEqual(sanitizeModuleNames(["account", " account", "unknown", "queue"], catalog), ["account", "queue"]);
  });
});

describe("planDependencyRemovals", () => {
  it("keeps deps still used by enabled modules", () => {
    const removed = [
      {
        dependencies: { shared: "1.0.0", onlyB: "2.0.0" },
        devDependencies: { td: "1.0.0" },
      },
    ];
    const enabled = [{ dependencies: { shared: "1.0.0" } }];
    assert.deepEqual(planDependencyRemovals(removed, enabled), {
      dependencies: ["onlyB"],
      devDependencies: ["td"],
    });
  });
});

describe("installSpecName / filterManagedRemovals", () => {
  it("strips the range from install specs while keeping npm scopes", () => {
    assert.equal(installSpecName("pkg@^1.0.0"), "pkg");
    assert.equal(installSpecName("@scope/pkg@^2.0.0"), "@scope/pkg");
    assert.equal(installSpecName("pkg"), "pkg");
  });

  it("only uninstalls packages the CLI itself installed", () => {
    const removals = { dependencies: ["cli-owned", "host-owned"], devDependencies: ["cli-dev"] };
    const managed = { dependencies: ["cli-owned"], devDependencies: ["cli-dev"] };
    assert.deepEqual(filterManagedRemovals(removals, managed), ["cli-owned", "cli-dev"]);
    // No record (legacy modules.json): uninstall nothing rather than risk a host dependency.
    assert.deepEqual(filterManagedRemovals(removals, undefined), []);
  });
});

describe("buildInstallSpecs", () => {
  it("builds name@range specs for prod and dev separately", () => {
    assert.deepEqual(buildInstallSpecs([{ dependencies: { a: "^1.0.0" }, devDependencies: { b: "^2.0.0" } }]), {
      dependencies: ["a@^1.0.0"],
      devDependencies: ["b@^2.0.0"],
    });
  });
});

describe("planDependencyInstalls", () => {
  it("lists only declared deps missing from package.json (resumable reconciliation)", () => {
    const enabled: DependencyDecls[] = [
      {
        dependencies: { present: "^1.0.0", missing: "^2.0.0" },
        devDependencies: { tdPresent: "^1.0.0", tdMissing: "^3.0.0" },
      },
      // Second module re-declares an already-present dep and a shared missing one.
      { dependencies: { present: "^1.0.0", shared: "^4.0.0" } },
    ];
    const installed: DependencyDecls = {
      dependencies: { present: "^1.0.0" },
      devDependencies: { tdPresent: "^1.0.0" },
    };
    assert.deepEqual(planDependencyInstalls(enabled, installed), {
      dependencies: ["missing@^2.0.0", "shared@^4.0.0"],
      devDependencies: ["tdMissing@^3.0.0"],
      conflicts: [],
    });
  });

  it("treats a package present under either dependency kind as installed", () => {
    const enabled: DependencyDecls[] = [{ dependencies: { cross: "^1.0.0" } }];
    const installed: DependencyDecls = { devDependencies: { cross: "^1.0.0" } };
    assert.deepEqual(planDependencyInstalls(enabled, installed), {
      dependencies: [],
      devDependencies: [],
      conflicts: [],
    });
  });

  it("reports distinct ranges declared for the same package as conflicts", () => {
    const enabled: DependencyDecls[] = [{ dependencies: { a: "^2.0.0" } }, { dependencies: { a: "^1.0.0" } }];
    const result = planDependencyInstalls(enabled, {});
    assert.deepEqual(result.conflicts, [{ name: "a", ranges: ["^1.0.0", "^2.0.0"] }]);
    // Sorted-first range is used for the install spec.
    assert.deepEqual(result.dependencies, ["a@^1.0.0"]);
  });
});
