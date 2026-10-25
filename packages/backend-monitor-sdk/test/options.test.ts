import assert from "node:assert/strict";
import { hostname } from "node:os";
import { describe, it } from "node:test";

import { resolveBackendMonitorOptions } from "../src/backend-monitor.options";

describe("resolveBackendMonitorOptions", () => {
  it("applies documented defaults for every unset field", () => {
    const resolved = resolveBackendMonitorOptions({ endpoint: "https://m.example.com/ingest", token: "t" });

    assert.equal(resolved.env, process.env.ENVIRONMENT ?? "");
    assert.equal(resolved.appVersion, "");
    assert.equal(resolved.instanceId, hostname());
    assert.equal(resolved.flushIntervalMs, 5000);
    assert.equal(resolved.maxBatchSize, 500);
    assert.equal(resolved.maxQueueSize, 2000);
  });

  it("keeps explicitly provided values", () => {
    const resolved = resolveBackendMonitorOptions({
      endpoint: "https://m.example.com/ingest",
      token: "t",
      env: "staging",
      appVersion: "2.3.4",
      instanceId: "i-123",
      flushIntervalMs: 1000,
      maxBatchSize: 10,
      maxQueueSize: 20,
    });

    assert.equal(resolved.env, "staging");
    assert.equal(resolved.appVersion, "2.3.4");
    assert.equal(resolved.instanceId, "i-123");
    assert.equal(resolved.flushIntervalMs, 1000);
    assert.equal(resolved.maxBatchSize, 10);
    assert.equal(resolved.maxQueueSize, 20);
  });
});
