import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { constructDateTime } from "../src/utilities/datetime.util";

describe("constructDateTime", () => {
  it("treats a numeric time zone as an offset in hours", () => {
    assert.equal(constructDateTime(2023, 7, 1, 12, 0, 0, 8).toISOString(), "2023-07-01T04:00:00.000Z");
    assert.equal(constructDateTime(2023, 7, 1, 12, 0, 0, -5).toISOString(), "2023-07-01T17:00:00.000Z");
    assert.equal(constructDateTime(2023, 7, 1, 12, 0, 0, 0).toISOString(), "2023-07-01T12:00:00.000Z");
  });

  it("supports fractional numeric offsets", () => {
    assert.equal(constructDateTime(2023, 7, 1, 12, 0, 0, 5.5).toISOString(), "2023-07-01T06:30:00.000Z");
    assert.equal(constructDateTime(2023, 7, 1, 12, 0, 0, 5.75).toISOString(), "2023-07-01T06:15:00.000Z");
  });

  it("falls back to UTC when the zone offset cannot be resolved", () => {
    assert.equal(constructDateTime(2023, 7, 1, 12, 0, 0, "UTC").toISOString(), "2023-07-01T12:00:00.000Z");
  });

  it("resolves IANA zone offsets instead of parsing the wall clock as local time", () => {
    assert.equal(
      constructDateTime(2023, 7, 1, 12, 0, 0, "America/Los_Angeles").toISOString(),
      "2023-07-01T19:00:00.000Z",
    );
    assert.equal(constructDateTime(2023, 7, 1, 12, 0, 0, "Asia/Shanghai").toISOString(), "2023-07-01T04:00:00.000Z");
  });
});
