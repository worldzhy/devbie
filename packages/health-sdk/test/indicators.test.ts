import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPrismaIndicator } from "../src/index";

describe("createPrismaIndicator", () => {
  it("keeps `this` bound to the client when running SELECT 1", async () => {
    // A plain PrismaClient resolves $queryRaw through `this` and throws
    // "Cannot read properties of undefined (reading '_createPrismaPromise')"
    // when the method is detached.
    const client = {
      executed: 0,
      async $queryRaw(strings: TemplateStringsArray): Promise<unknown> {
        assert.equal(this, client);
        assert.deepEqual([...strings], ["SELECT 1"]);
        this.executed += 1;
        return [{ "?column?": 1 }];
      },
    };

    assert.deepEqual(await createPrismaIndicator(client).check(), { status: "up" });
    assert.equal(client.executed, 1);
  });

  it("reports down when $queryRaw is unavailable", async () => {
    assert.deepEqual(await createPrismaIndicator({}).check(), {
      status: "down",
      message: "$queryRaw not available",
    });
  });
});
