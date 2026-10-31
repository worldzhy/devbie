import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WherePipe } from "../src/pipes/where.pipe";

const pipe = new WherePipe();

describe("WherePipe", () => {
  it("keeps a colon inside a scalar operator value", () => {
    assert.deepEqual(pipe.transform("name: contains foo:bar"), { name: { contains: "foo:bar" } });
  });

  it("nests a relation operator operand as field:value", () => {
    assert.deepEqual(pipe.transform("roles: some name:admin"), { roles: { some: { name: "admin" } } });
  });

  it("does not nest a relation operand with more than two segments", () => {
    assert.deepEqual(pipe.transform("roles: some name:admin:extra"), { roles: { some: "name:admin:extra" } });
  });
});
