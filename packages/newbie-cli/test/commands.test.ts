import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseModuleSelector } from "../src/lib/module-selector";

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
