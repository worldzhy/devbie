# @devbie/health-sdk

[![npm version](https://img.shields.io/npm/v/@devbie/health-sdk?style=flat-square)](https://www.npmjs.com/package/@devbie/health-sdk)
[![license](https://img.shields.io/npm/l/@devbie/health-sdk?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
[![node](https://img.shields.io/node/v/@devbie/health-sdk?style=flat-square)](https://www.npmjs.com/package/@devbie/health-sdk)

Health reporting for Node.js services: runs known dependency indicators
(database, redis, object storage, ...) on an interval and POSTs the aggregate
health snapshot to your health endpoint.

- **Known-indicator registry** — `KNOWN_INDICATORS` plus `scanKnownServices()`
  detect which dependencies an app actually wired up, so reports cover real
  infrastructure instead of a static checklist.
- **Bounded check runtime** — every indicator runs under a timeout via
  `runCheck()`, so a hung dependency degrades to `down` instead of stalling
  the report.
- **Framework-agnostic core** — `startHealthReporting()` accepts any Nest-like
  app handle; interval timers are `unref()`-ed.

## Requirements

- Node.js `>= 20`

## Installation

```bash
npm install @devbie/health-sdk
```

## Usage

```ts
import { startHealthReporting } from "@devbie/health-sdk";

const health = startHealthReporting(app, {
  endpoint: "https://heartbeat.example.com/health/report",
  token: process.env.HEALTH_TOKEN!,
  appVersion: "1.4.2",
  env: "prod",
});

// On shutdown:
health.stop();
```

## License

MIT
