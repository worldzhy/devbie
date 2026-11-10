# @devbie/newbie

[![npm version](https://img.shields.io/npm/v/@devbie/newbie?style=flat-square)](https://www.npmjs.com/package/@devbie/newbie)
[![license](https://img.shields.io/npm/l/@devbie/newbie?style=flat-square)](https://github.com/worldzhy/devbie/blob/dev/LICENSE)

A batteries-included backend application framework runtime built on top of
[NestJS 11](https://nestjs.com/), [Prisma 7](https://www.prisma.io/) and
[Express 5](https://expressjs.com/). Newbie gives you a production-ready
bootstrap in a single call — security middleware, validation, cursor
pagination pipes, a layered exception-filter chain, extended Prisma access and
optional self-reporting — without forcing you to wire it all together.

## Features

- **One-call bootstrap** — `NewbieFactory.create()` configures CORS, cookie
  parsing, body parsers, the global `ValidationPipe`, Helmet (production) and
  Swagger (development), then starts the HTTP server.
- **Global framework module** — `FrameworkModule.forRoot()` installs config
  loading, rate limiting, `HttpModule`, a unified response interceptor and a
  five-layer exception-filter chain.
- **Extended Prisma integration** — supply your generated `PrismaClient` and
  get a global `PrismaService` that supports client extensions registered
  after module initialization.
- **Query parameter pipes** — cursor pagination, cursor slug, ordering and
  `select`/`include`/`where` parsing for Prisma-driven list endpoints.
- **Shared DTOs and utilities** — pagination request/response DTOs plus crypto,
  datetime, array and other common helpers.
- **Observability built in** — graceful shutdown with bounded request
  draining, watch-mode port-race recovery, and env-gated backend monitor
  probe (`BACKEND_MONITOR_ENDPOINT` + `BACKEND_MONITOR_TOKEN`) and
  module-hub reporter (`MODULE_HUB_ENDPOINT` + `MODULE_HUB_TOKEN`).

## Requirements

`@devbie/newbie` is a runtime library; NestJS, Prisma and related packages are
declared as peer dependencies so your project controls their versions:

| Peer dependency            | Version   |
| -------------------------- | --------- |
| `@nestjs/common`           | `^11.0.0` |
| `@nestjs/core`             | `^11.0.0` |
| `@nestjs/platform-express` | `^11.0.0` |
| `@nestjs/config`           | `^4.0.0`  |
| `@nestjs/swagger`          | `^11.0.0` |
| `@nestjs/throttler`        | `^6.0.0`  |
| `@nestjs/axios`            | `^4.0.0`  |
| `@prisma/client`           | `^7.0.0`  |
| `@prisma/adapter-pg`       | `^7.0.0`  |
| `express`                  | `^5.0.0`  |

## Installation

```bash
npm install @devbie/newbie
```

## Quick start

Register `FrameworkModule.forRoot()` in your root module and pass your
generated `PrismaClient` constructor:

```ts
// src/application/application.module.ts
import { Module } from "@nestjs/common";
import { FrameworkModule } from "@devbie/newbie";
import { PrismaClient } from "@generated/prisma/client";
import { ApplicationController } from "./application.controller";

@Module({
  imports: [FrameworkModule.forRoot({ prisma: { PrismaClient } })],
  controllers: [ApplicationController],
})
export class ApplicationModule {}
```

Then bootstrap with `NewbieFactory`:

```ts
// src/main.ts
import { NewbieFactory } from "@devbie/newbie";
import { ApplicationModule } from "./application/application.module";

async function bootstrap(): Promise<void> {
  await NewbieFactory.create(ApplicationModule, {
    swagger: { title: "My API" },
  });
}

void bootstrap();
```

The fastest way to get this structure is to scaffold a project with the
companion CLI:

```bash
npx @devbie/newbie-cli create my-app
```

## NewbieFactory options

`NewbieFactory.create(rootModule, options)` accepts the following options
(every field is optional):

| Option               | Type              | Default                                 | Description                                                                      |
| -------------------- | ----------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `environment`        | `string`          | `ENVIRONMENT` or `development`          | `development` enables Swagger; `production` enables Helmet.                      |
| `port`               | `number`          | `PORT` or `3000`                        | Port the HTTP server listens on.                                                 |
| `corsAllowedOrigins` | `string[]`        | `ALLOWED_ORIGINS`                       | Allowed CORS origins (credentials enabled).                                      |
| `bodyLimit`          | `string`          | `10mb`                                  | Maximum request body size.                                                       |
| `requestTimeout`     | `number`          | `60000`                                 | Request timeout in milliseconds.                                                 |
| `keepAliveTimeout`   | `number`          | —                                       | Keep-alive timeout in milliseconds.                                              |
| `logger`             | `string[]`        | `LOG_LEVEL` or `['log','warn','error']` | NestJS log levels.                                                               |
| `swagger`            | `object \| false` | enabled in development                  | Swagger config (`title`, `description`, `version`, `path`, default path `/api`). |
| `portRaceRecovery`   | `boolean`         | `environment !== "production"`          | Survive port races during `nest start --watch` under bind mounts.                |
| `shutdownTimeoutMs`  | `number`          | `10000`                                 | Grace period for in-flight requests on SIGTERM/SIGINT.                           |
| `cluster`            | `boolean`         | `false`                                 | Run one worker per available CPU core.                                           |

### What the framework wires for you

- `cookie-parser`, JSON/URL-encoded body parsers, and always-on `text/plain`
  parsing (monitor SDKs report via `navigator.sendBeacon`).
- CORS with credentials, plus the v4 (extended) Express query parser. Routes
  decorated with `@AllowAnyOrigin()` answer `Access-Control-Allow-Origin: *`
  (preflight included) while every other route keeps the origin whitelist.
- A global `ValidationPipe` with `transform` and `whitelist` enabled.
- Helmet in production; Swagger UI (cookie + bearer auth) in development.
- A global throttler guard (10000 requests / second per endpoint by default).
- A response-shaping `HttpResponseInterceptor`.
- Exception filters in priority order: throttler → Prisma → newbie → HTTP →
  catch-all, so every failure gets a consistent error envelope.
- Env-gated reporters after listen: heartbeat (`HEARTBEAT_*`), module-hub
  (`MODULE_HUB_*`) and dependency health (`HEALTH_*`; checks always run, the
  POST is skipped when the endpoint is unset).

## List endpoints and query pipes

Newbie ships pipes that translate query parameters into Prisma arguments:

- `WherePipe` — parse a `where` query parameter into a Prisma filter.
- `OrderByPipe` — parse ordering parameters.
- `SelectIncludePipe` — parse `select` / `include` parameters.
- `CursorPipe` / `CursorSlugPipe` — keyset (cursor) pagination parameters.

Shared DTOs (`CommonListRequestDto`, `CommonListResponseDto`,
`CommonGetByStringIdRequestDto`, `CommonGetByNumberIdRequestDto`) keep list
endpoints consistent across modules. The `@Cookies()` parameter decorator
provides typed access to request cookies.

## Environment variables

| Variable              | Used for                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`         | `development` or `production`.                                                                |
| `PORT`                | HTTP listen port.                                                                             |
| `ALLOWED_ORIGINS`     | Comma-separated CORS origin list.                                                             |
| `LOG_LEVEL`           | Comma-separated NestJS log levels (e.g. `log,warn,error`).                                    |
| `MODULE_HUB_ENDPOINT` | Full report URL; enables module-hub self-reporting when set together with `MODULE_HUB_TOKEN`. |
| `MODULE_HUB_TOKEN`    | Token sent to the module hub.                                                                 |

When both `MODULE_HUB_ENDPOINT` and `MODULE_HUB_TOKEN` are present, the
framework automatically sends a full snapshot on boot and a ping every 60
seconds. Reporting is fire-and-forget and never blocks application startup.

## Related packages

- [`@devbie/newbie-cli`](https://www.npmjs.com/package/@devbie/newbie-cli) —
  scaffold projects and install modules from the newbie-modules registry.
- [`@devbie/heartbeat-sdk`](https://www.npmjs.com/package/@devbie/heartbeat-sdk)
  — framework-agnostic installation liveness reporting.
- [`@devbie/frontend-monitor-sdk`](https://www.npmjs.com/package/@devbie/frontend-monitor-sdk)
  — browser-side PV, AJAX, resource and JS error reporting.

## License

[MIT](https://github.com/worldzhy/devbie/blob/dev/LICENSE)
