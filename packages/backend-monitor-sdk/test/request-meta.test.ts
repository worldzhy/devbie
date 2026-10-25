import assert from "node:assert/strict";
import type { Request } from "express";
import { describe, it } from "node:test";

import {
  getMonitorMeta,
  INGEST_PATH,
  isMonitoringTraffic,
  LOOP_GUARD_HEADER,
  routeTemplate,
  safePathname,
  setMonitorMeta,
} from "../src/request-meta.util";

function asRequest(shape: Record<string, unknown>): Request {
  return { headers: {}, ...shape } as unknown as Request;
}

describe("monitor meta", () => {
  it("round-trips through the request object", () => {
    const request = asRequest({});
    const meta = { requestId: "id-1", startDate: new Date() };

    setMonitorMeta(request, meta);

    assert.equal(getMonitorMeta(request), meta);
  });

  it("is hidden from enumeration so it never leaks into serialized payloads", () => {
    const request = asRequest({});
    setMonitorMeta(request, { requestId: "id-1", startDate: new Date() });

    assert.deepEqual(Object.keys(request), ["headers"]);
  });

  it("is undefined for requests the probe never touched", () => {
    assert.equal(getMonitorMeta(asRequest({})), undefined);
  });
});

describe("isMonitoringTraffic", () => {
  it("treats the ingest path as monitor traffic", () => {
    assert.equal(isMonitoringTraffic(asRequest({ originalUrl: INGEST_PATH })), true);
    assert.equal(isMonitoringTraffic(asRequest({ originalUrl: `${INGEST_PATH}/retry` })), true);
  });

  it("does not confuse look-alike prefixes with the ingest path", () => {
    assert.equal(isMonitoringTraffic(asRequest({ originalUrl: `${INGEST_PATH}ing` })), false);
    assert.equal(isMonitoringTraffic(asRequest({ originalUrl: "/backend-monitor" })), false);
  });

  it("treats the loop-guard header as monitor traffic", () => {
    assert.equal(
      isMonitoringTraffic(asRequest({ headers: { [LOOP_GUARD_HEADER]: "1" }, originalUrl: "/users" })),
      true,
    );
  });

  it("ignores the query string when matching the ingest path", () => {
    assert.equal(isMonitoringTraffic(asRequest({ originalUrl: `${INGEST_PATH}?token=secret` })), true);
  });

  it("passes ordinary business traffic", () => {
    assert.equal(isMonitoringTraffic(asRequest({ originalUrl: "/users/1" })), false);
  });
});

describe("safePathname", () => {
  it("strips the query string so tokens never leave the process", () => {
    const request = asRequest({ originalUrl: "/users?token=abc&phone=123" });
    assert.equal(safePathname(request), "/users");
  });

  it("falls back to url when originalUrl is absent", () => {
    assert.equal(safePathname(asRequest({ url: "/plain?x=1" })), "/plain");
  });
});

describe("routeTemplate", () => {
  it("combines the mount base with the matched route pattern", () => {
    const request = asRequest({ baseUrl: "/api", route: { path: "/users/:id" } });
    assert.equal(routeTemplate(request), "/api/users/:id");
  });

  it("is empty for unmatched routes (404s)", () => {
    assert.equal(routeTemplate(asRequest({})), "");
  });
});
