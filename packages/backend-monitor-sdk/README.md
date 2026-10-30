# @devbie/backend-monitor-sdk

[![npm version](https://img.shields.io/npm/v/@devbie/backend-monitor-sdk?style=flat-square)](https://www.npmjs.com/package/@devbie/backend-monitor-sdk)
[![license](https://img.shields.io/npm/l/@devbie/backend-monitor-sdk?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/backend-monitor-sdk?style=flat-square)](https://www.npmjs.com/package/@devbie/backend-monitor-sdk)

Server-side monitoring SDK for Node.js backends: batches request metrics and
error events in memory and POSTs them to a monitor ingest endpoint.
Fire-and-forget with a bounded queue — monitoring never blocks or crashes the
host application.

- **Zero runtime dependencies** — plain `fetch`, works on any Node.js >= 20.
- **Bounded batching** — queue caps with drop counters, single in-flight
  flush, automatic flush on batch size and on `beforeExit`.
- **Loop-safe** — requests to the ingest endpoint itself are never monitored,
  so the reporter cannot amplify its own traffic.
- **Framework adapters** — native Express middleware in the main entry; the
  NestJS module/interceptor lives at `@devbie/backend-monitor-sdk/nest`.

## Requirements

- Node.js `>= 20`
- `@nestjs/*` peer dependencies only when using the `/nest` adapter

## Installation

```bash
npm install @devbie/backend-monitor-sdk
```

## Usage

### Express

```ts
import { MonitorEventReporter, createExpressMonitorMiddleware } from "@devbie/backend-monitor-sdk";

const reporter = new MonitorEventReporter({
  endpoint: "https://monitor.example.com/ingest",
  token: process.env.MONITOR_TOKEN!,
  appVersion: "1.4.2",
  env: "prod",
});

app.use(createExpressMonitorMiddleware(reporter));
```

### NestJS

```ts
import { BackendMonitorModule } from "@devbie/backend-monitor-sdk/nest";

@Module({
  imports: [
    BackendMonitorModule.forRoot({
      endpoint: "https://monitor.example.com/ingest",
      token: process.env.MONITOR_TOKEN!,
      appVersion: "1.4.2",
      env: "prod",
    }),
  ],
})
export class AppModule {}
```

## License

MIT
