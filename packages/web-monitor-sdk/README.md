# @devbie/web-monitor-sdk

[![npm version](https://img.shields.io/npm/v/@devbie/web-monitor-sdk?style=flat-square)](https://www.npmjs.com/package/@devbie/web-monitor-sdk)
[![license](https://img.shields.io/npm/l/@devbie/web-monitor-sdk?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)

Browser-side web monitoring SDK. It automatically collects page-view and page
performance data, AJAX calls (both `XMLHttpRequest` and `fetch`), resource
loading, JavaScript errors and custom events, and reports them to a collector
endpoint. The SDK handles monitoring only — no heartbeat and no credential
logic.

## Features

- **Page performance** — load timing, first-entry metadata, screen size,
  referrer and performance entries.
- **AJAX monitoring** — transparently instruments `XMLHttpRequest` and
  `fetch`, recording method, URL, status, response size, timing and optional
  trace ID.
- **Resource monitoring** — slow and failed resource loads via
  `PerformanceObserver` and resource `error` events.
- **Error monitoring** — `window.onerror`, `unhandledrejection`, resource load
  failures and `console.error`, with parsed stack traces.
- **Custom events** — report business events with throttled batching.
- **Business error codes** — plug in an `errcodeReport` resolver to flag
  business-level failures inside HTTP 200 responses.
- **Anonymous identity** — per-user, per-page, unique-visitor and device marks
  generated in the browser.

## Installation

```bash
npm install @devbie/web-monitor-sdk
```

## Quick start

Initialize the SDK as early as possible in your application — for example in
your root layout or application entry:

```ts
import init from "@devbie/web-monitor-sdk";

init({
  appId: "my-app",
  api: "https://collector.example.com/api/web-monitor/report",
});
```

The `init` call returns helper functions for manual reporting:

```ts
const monitor = init({ appId: "my-app", api: "https://collector.example.com/api/web-monitor/report" });

monitor.addCustom({
  customName: "checkout",
  customContent: { orderId: "1001", amount: 99 },
});
```

### Use with Next.js

The Fewbie framework ships a ready-made registry wrapper:

```bash
npx @devbie/fewbie-cli add web-monitor-sdk
```

Then add the scaffolded `<WebMonitor />` component to your root layout and
configure `NEXT_PUBLIC_WEB_MONITOR_ENDPOINT`, `NEXT_PUBLIC_WEB_MONITOR_APP_ID` and `NEXT_PUBLIC_WEB_MONITOR_TOKEN`.
The component is a no-op until all three environment variables are present.

## Init options

| Option              | Type       | Default      | Required | Description                                                                                                                       |
| ------------------- | ---------- | ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `appId`             | `string`   | —            | Yes      | Application identifier sent with every report.                                                                                    |
| `api`               | `string`   | —            | Yes      | Collector endpoint that receives report payloads.                                                                                 |
| `isPage`            | `boolean`  | `true`       | No       | Collect page-view / page performance data.                                                                                        |
| `isAjax`            | `boolean`  | `true`       | No       | Instrument XHR and `fetch` requests.                                                                                              |
| `isResource`        | `boolean`  | `true`       | No       | Collect resource timing and slow/failed resources.                                                                                |
| `isError`           | `boolean`  | `true`       | No       | Collect JS errors, rejections, resource errors and console errors.                                                                |
| `filterUrls`        | `string[]` | `[]`         | No       | URLs excluded from AJAX/resource collection. The collector endpoint (`/api/web-monitor/report`) is always filtered automatically. |
| `user`              | `object`   | `{}`         | No       | Initial user identity: `{ uid?, p? }` (`p` should be pre-encrypted).                                                              |
| `isTraceId`         | `boolean`  | `false`      | No       | Capture the trace ID response header from AJAX calls.                                                                             |
| `traceIdHeaderName` | `string`   | `x-trace-id` | No       | Response header name to read when `isTraceId` is enabled.                                                                         |
| `customsThrottleMs` | `number`   | `1000`       | No       | Throttle window for batching custom events, in milliseconds.                                                                      |
| `errcodeReport`     | `function` | —            | No       | Business error resolver, see below.                                                                                               |

## Returned API

`init()` returns an object with the following members:

### `addError(error)`

Manually push a script error for immediate reporting:

```ts
monitor.addError({
  msg: "Something went wrong",
  line: 42,
  col: 10,
  resourceUrl: "https://example.com/app.js",
});
```

### `addCustom(event)`

Queue a custom event. Object content is serialized to JSON; queued events are
flushed (and batched) after `customsThrottleMs`:

```ts
monitor.addCustom({
  customName: "button-click",
  customContent: "pay-now",
  customFilter: { page: "checkout" }, // optional, must be an object
});
```

### `setConfig(config)`

Update the user identity after initialization. When `p` is supplied it is
encrypted before storage:

```ts
monitor.setConfig({ uid: "10086", p: "plain-text-secret" });
```

## Business error reporting

HTTP 200 responses can still represent business failures. Provide an
`errcodeReport` resolver to inspect parsed response data and decide whether to
report an error:

```ts
init({
  appId: "my-app",
  api: "https://collector.example.com/api/web-monitor/report",
  errcodeReport: (responseData) => {
    return {
      isReport: responseData.code !== 0,
      errMsg: responseData.message,
      code: responseData.code,
    };
  },
});
```

## Report types and transport

Reports carry one of the following types:

| Type       | Content                                               |
| ---------- | ----------------------------------------------------- |
| `PagePerf` | Page performance, resources and errors on navigation. |
| `AjaxPerf` | AJAX activity and errors between page reports.        |
| `Error`    | Errors captured immediately (debounced).              |
| `Custom`   | Batched custom events.                                |
| `Unload`   | Final report on page unload.                          |
| `SdkError` | Errors thrown inside the SDK itself.                  |

Payloads are POSTed with `Content-Type: text/plain` via `fetch` (so monitoring
requests are never re-instrumented), and the final `Unload` report uses
`navigator.sendBeacon` when available. If the collector becomes unreachable,
reporting is paused to avoid request storms.

## Global access

For integrations that cannot import the module directly, the default
initializer is also exposed on the browser as `window._frontendMonitor`.

## Related packages

- [`@devbie/heartbeat-sdk`](https://www.npmjs.com/package/@devbie/heartbeat-sdk)
  — server-side installation liveness reporting.
- [`@devbie/newbie`](https://www.npmjs.com/package/@devbie/newbie) — Newbie
  backend framework runtime.
- [`@devbie/newbie-cli`](https://www.npmjs.com/package/@devbie/newbie-cli) —
  Newbie framework command-line tool.
- [`@devbie/fewbie-cli`](https://www.npmjs.com/package/@devbie/fewbie-cli) —
  install the web-monitor wrapper component in Next.js projects.

## License

[MIT](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
