import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MonitorEventReporter } from "../src/backend-monitor.reporter";
import type {
  IngestPayload,
  MonitoredErrorEvent,
  MonitoredRequestEvent,
  ResolvedBackendMonitorOptions,
} from "../src/backend-monitor.types";

function makeOptions(overrides: Partial<ResolvedBackendMonitorOptions> = {}): ResolvedBackendMonitorOptions {
  return {
    endpoint: "https://monitor.example.com/ingest",
    token: "token_test",
    env: "test",
    appVersion: "1.0.0",
    instanceId: "test-instance",
    // Long interval: tests drive flush() explicitly unless stated otherwise.
    flushIntervalMs: 60_000,
    maxBatchSize: 2,
    maxQueueSize: 3,
    ...overrides,
  };
}

function makeRequestEvent(id: string): MonitoredRequestEvent {
  return {
    requestId: id,
    route: "/users/:id",
    path: "/users/1",
    method: "GET",
    statusCode: 200,
    requestAt: new Date().toISOString(),
    responseAt: new Date().toISOString(),
  };
}

function makeErrorEvent(id: string): MonitoredErrorEvent {
  return {
    requestId: id,
    type: "Error",
    message: "boom",
    route: "/users/:id",
    path: "/users/1",
    method: "GET",
    statusCode: 500,
    occurredAt: new Date().toISOString(),
  };
}

/** Collects every payload the reporter ships. */
function recordingTransport(sent: IngestPayload[]) {
  return async (payload: IngestPayload) => {
    sent.push(payload);
  };
}

/** Lets the reporter's internal `void this.flush()` chains settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe("MonitorEventReporter batching", () => {
  it("ships both kinds in one ingest payload per flush", async () => {
    const sent: IngestPayload[] = [];
    const reporter = new MonitorEventReporter(makeOptions(), recordingTransport(sent));

    reporter.enqueueRequest(makeRequestEvent("r1"));
    reporter.enqueueError(makeErrorEvent("e1"));
    await reporter.flush();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].env, "test");
    assert.equal(sent[0].instanceId, "test-instance");
    assert.deepEqual(
      sent[0].requests.map((r) => r.requestId),
      ["r1"],
    );
    assert.deepEqual(
      sent[0].errors.map((e) => e.requestId),
      ["e1"],
    );
    assert.equal(reporter.pendingCount, 0);
  });

  it("flushes automatically once a kind reaches the batch cap", async () => {
    const sent: IngestPayload[] = [];
    const reporter = new MonitorEventReporter(makeOptions(), recordingTransport(sent));

    reporter.enqueueRequest(makeRequestEvent("r1"));
    assert.equal(sent.length, 0);
    reporter.enqueueRequest(makeRequestEvent("r2"));
    await settle();

    assert.equal(sent.length, 1);
    assert.deepEqual(
      sent[0].requests.map((r) => r.requestId),
      ["r1", "r2"],
    );
    assert.equal(reporter.pendingCount, 0);
  });

  it("caps each kind at maxBatchSize and flushes the remainder in a follow-up batch", async () => {
    const sent: IngestPayload[] = [];
    const reporter = new MonitorEventReporter(makeOptions(), recordingTransport(sent));

    reporter.enqueueRequest(makeRequestEvent("r1"));
    reporter.enqueueError(makeErrorEvent("e1"));
    // Reaching the cap auto-flushes synchronously: the first batch takes
    // r1+r2 (requests at cap) plus e1 (errors below cap, shipped along).
    reporter.enqueueRequest(makeRequestEvent("r2"));
    reporter.enqueueRequest(makeRequestEvent("r3"));
    await settle();

    assert.equal(sent.length, 2);
    assert.deepEqual(
      sent[0].requests.map((r) => r.requestId),
      ["r1", "r2"],
    );
    assert.deepEqual(
      sent[0].errors.map((e) => e.requestId),
      ["e1"],
    );
    assert.deepEqual(
      sent[1].requests.map((r) => r.requestId),
      ["r3"],
    );
    assert.equal(reporter.pendingCount, 0);
  });

  it("preserves arrival order within each kind across the split", async () => {
    // Caps above the event count so enqueue never triggers an auto-flush.
    const sent: IngestPayload[] = [];
    const reporter = new MonitorEventReporter(
      makeOptions({ maxBatchSize: 10, maxQueueSize: 10 }),
      recordingTransport(sent),
    );

    reporter.enqueueRequest(makeRequestEvent("r1"));
    reporter.enqueueError(makeErrorEvent("e1"));
    reporter.enqueueRequest(makeRequestEvent("r2"));
    reporter.enqueueError(makeErrorEvent("e2"));

    const batch = reporter.takeBatch();
    assert.deepEqual(
      batch?.requests.map((r) => r.requestId),
      ["r1", "r2"],
    );
    assert.deepEqual(
      batch?.errors.map((e) => e.requestId),
      ["e1", "e2"],
    );
    await settle();
  });

  it("is a no-op when the queue is empty", async () => {
    const sent: IngestPayload[] = [];
    const reporter = new MonitorEventReporter(makeOptions(), recordingTransport(sent));

    await reporter.flush();

    assert.equal(sent.length, 0);
    assert.equal(reporter.takeBatch(), null);
  });
});

describe("MonitorEventReporter backpressure", () => {
  it("drops NEW events once the queue is full, never blocking the host", () => {
    const reporter = new MonitorEventReporter(makeOptions({ maxQueueSize: 3, maxBatchSize: 10 }));

    for (let i = 0; i < 5; i += 1) reporter.enqueueRequest(makeRequestEvent(`r${i}`));

    assert.equal(reporter.pendingCount, 3);
    assert.equal(reporter.droppedCount, 2);
  });

  it("drops a failed batch instead of retrying it, and counts the failure", async () => {
    const reporter = new MonitorEventReporter(makeOptions(), async () => {
      throw new Error("platform down");
    });

    reporter.enqueueRequest(makeRequestEvent("r1"));
    await reporter.flush();

    assert.equal(reporter.failedBatchCount, 1);
    assert.equal(reporter.pendingCount, 0);
  });

  it("skips a flush that overlaps one already in flight", async () => {
    let release: () => void = () => {};
    let sendCount = 0;
    const reporter = new MonitorEventReporter(makeOptions(), async () => {
      sendCount += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    reporter.enqueueRequest(makeRequestEvent("r1"));
    const first = reporter.flush();
    // Second call while the first holds the lock must return immediately.
    await reporter.flush();
    assert.equal(sendCount, 1);

    release();
    await first;
    assert.equal(reporter.pendingCount, 0);
  });
});

describe("MonitorEventReporter lifecycle", () => {
  it("flushes on the interval timer while started", async () => {
    const sent: IngestPayload[] = [];
    const reporter = new MonitorEventReporter(makeOptions({ flushIntervalMs: 20 }), recordingTransport(sent));

    reporter.start();
    reporter.enqueueRequest(makeRequestEvent("r1"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    reporter.stop();

    assert.equal(sent.length, 1);
    assert.equal(reporter.pendingCount, 0);
  });

  it("attaches at most one beforeExit drain across start/stop cycles", () => {
    const reporter = new MonitorEventReporter(makeOptions());
    const baseline = process.listenerCount("beforeExit");

    reporter.start();
    reporter.start();
    assert.equal(process.listenerCount("beforeExit"), baseline + 1);

    reporter.stop();
    assert.equal(process.listenerCount("beforeExit"), baseline);
  });
});
