import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { describe, it } from "node:test";

import type { MonitorEventReporter } from "../src/backend-monitor.reporter";
import type { MonitoredRequestEvent } from "../src/backend-monitor.types";
import { createExpressMonitorMiddleware } from "../src/express-monitor.middleware";
import { INGEST_PATH, LOOP_GUARD_HEADER } from "../src/request-meta.util";

interface MockResponse extends Partial<Response> {
  statusCode: number;
  emitFinish: () => void;
}

function mockRequest(shape: Record<string, unknown>): Request {
  return {
    method: "get",
    headers: {},
    originalUrl: "/users/1",
    ip: "127.0.0.1",
    baseUrl: "",
    route: { path: "/users/:id" },
    ...shape,
  } as unknown as Request;
}

function mockResponse(statusCode = 200): MockResponse {
  const handlers: Record<string, () => void> = {};
  const response: MockResponse = {
    statusCode,
    on(event: string, listener: () => void) {
      handlers[event] = listener;
      return response as Response;
    },
    emitFinish() {
      handlers["finish"]?.();
    },
  };
  return response;
}

function mockNext(): { next: NextFunction; called: () => boolean } {
  let called = false;
  return {
    next: (() => {
      called = true;
    }) as NextFunction,
    called: () => called,
  };
}

describe("createExpressMonitorMiddleware", () => {
  it("captures one request event when the response finishes", () => {
    const captured: MonitoredRequestEvent[] = [];
    const reporter = {
      enqueueRequest: (event: MonitoredRequestEvent) => captured.push(event),
    } as unknown as MonitorEventReporter;
    const middleware = createExpressMonitorMiddleware(reporter);
    const request = mockRequest({ headers: { "user-agent": "agent/1.0" } });
    const response = mockResponse(201);
    const { next, called } = mockNext();

    middleware(request, response as Response, next);
    assert.equal(called(), true);

    response.emitFinish();

    assert.equal(captured.length, 1);
    assert.equal(captured[0].method, "GET");
    assert.equal(captured[0].route, "/users/:id");
    assert.equal(captured[0].path, "/users/1");
    assert.equal(captured[0].statusCode, 201);
    assert.equal(captured[0].ip, "127.0.0.1");
    assert.equal(captured[0].userAgent, "agent/1.0");
    assert.ok(captured[0].requestId.length > 0);
  });

  it("skips ingest-path traffic entirely so the probe never records itself", () => {
    const captured: MonitoredRequestEvent[] = [];
    const reporter = {
      enqueueRequest: (event: MonitoredRequestEvent) => captured.push(event),
    } as unknown as MonitorEventReporter;
    const middleware = createExpressMonitorMiddleware(reporter);
    const { next, called } = mockNext();

    middleware(mockRequest({ originalUrl: INGEST_PATH }), mockResponse() as Response, next);
    assert.equal(called(), true);
    assert.equal(captured.length, 0);
  });

  it("skips traffic tagged with the loop-guard header", () => {
    const captured: MonitoredRequestEvent[] = [];
    const reporter = {
      enqueueRequest: (event: MonitoredRequestEvent) => captured.push(event),
    } as unknown as MonitorEventReporter;
    const middleware = createExpressMonitorMiddleware(reporter);

    middleware(mockRequest({ headers: { [LOOP_GUARD_HEADER]: "1" } }), mockResponse() as Response, mockNext().next);

    assert.equal(captured.length, 0);
  });
});
