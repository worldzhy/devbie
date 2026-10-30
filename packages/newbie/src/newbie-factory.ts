import { Logger, LogLevel, Type, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerCustomOptions, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { json, text, urlencoded } from "express";
import helmet from "helmet";
import cluster from "node:cluster";
import os from "node:os";
import { startHealthReporting } from "@devbie/health-sdk";
import { startHeartbeat } from "@devbie/heartbeat-sdk";
import { startBackendMonitoring } from "@devbie/backend-monitor-sdk/nest";
import { listenWithPortRaceRecovery } from "./port-race";
import { registerGracefulShutdown } from "./graceful-shutdown";
import { startModuleHubReporting } from "./module-hub/reporter";
import { AllowAnyOriginRegistry } from "./cors/allow-any-origin.registry";
import { resolveFrameworkEnv } from "./utilities/framework-env.util";

const logger = new Logger("NewbieFactory");

/** Default NestJS log levels — verbose/debug are opt-in via LOG_LEVEL env. */
const DEFAULT_LOG_LEVELS: LogLevel[] = ["log", "warn", "error"];

export type NewbieEnvironment = "development" | "production";

export interface NewbieSwaggerOptions {
  title: string;
  description?: string;
  version?: string;
  /** Swagger UI path, defaults to '/api'. */
  path?: string;
}

export interface NewbieAppOptions {
  environment?: NewbieEnvironment;
  port?: number;
  corsAllowedOrigins?: string[];
  bodyLimit?: string;
  requestTimeout?: number;
  /**
   * Reduce keep-alive so idle connections don't delay server.close() during
   * watch-mode restarts (which would hold the port longer than necessary).
   */
  keepAliveTimeout?: number;
  /**
   * NestJS log levels (e.g. ['log', 'warn', 'error']). Defaults to the
   * comma-separated LOG_LEVEL env var, or ['log', 'warn', 'error'] so that
   * verbose/debug logs do not spam the console in normal runs.
   */
  logger?: LogLevel[];
  /**
   * Survive port races during `nest start --watch` under Docker bind mounts:
   * probe the port, kill stale previous-generation holders, stand down when a
   * same-generation sibling wins, and fall back to SO_REUSEPORT. Also installs
   * fast-shutdown SIGTERM/SIGINT handlers that release the port immediately.
   * Defaults to `environment !== "production"`.
   */
  portRaceRecovery?: boolean;
  /**
   * Grace period for in-flight requests on SIGTERM/SIGINT when
   * portRaceRecovery is disabled (production). Idle keep-alive connections
   * are dropped immediately; requests still running after this timeout get
   * force-closed so the process can exit. Defaults to 10s.
   */
  shutdownTimeoutMs?: number;
  /**
   * Swagger config in development. Pass `false` to disable.
   * Defaults to enabled with generic titles (preserves legacy behavior).
   */
  swagger?: NewbieSwaggerOptions | false;
  cluster?: boolean;
}

export interface NewbieBootstrapResult {
  app: NestExpressApplication;
  server: ReturnType<NestExpressApplication["listen"]> extends Promise<infer T> ? T : never;
}

function clusterize(callback: () => unknown): void {
  if (cluster.isPrimary) {
    const numCPUs = os.availableParallelism();
    logger.log(`Master server is running with ${numCPUs} workers`);

    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on("online", (worker) => {
      logger.log(`Worker ${worker.id} is online`);
    });

    // Crash-window guard: if too many workers exit within a short window,
    // something is fundamentally broken (bad config, missing DB, etc.) and
    // forking more workers would just create a fork storm. Stop the master
    // so the orchestrator (Docker / k8s) can surface the real error.
    const MAX_EXITS = 10;
    const EXIT_WINDOW_MS = 10_000;
    const exitTimestamps: number[] = [];

    cluster.on("exit", (worker) => {
      const now = Date.now();
      exitTimestamps.push(now);
      while (exitTimestamps.length && now - exitTimestamps[0] > EXIT_WINDOW_MS) {
        exitTimestamps.shift();
      }

      if (exitTimestamps.length >= MAX_EXITS) {
        logger.error(
          `${exitTimestamps.length} workers exited within ${EXIT_WINDOW_MS}ms; stopping master to avoid fork storm`,
        );
        process.exit(1);
      }

      logger.warn(`Worker ${worker.id} exited; restarting`);
      cluster.fork();
    });
  } else {
    callback();
  }
}

export class NewbieFactory {
  /**
   * Creates and starts a fully configured NestJS (Express) application.
   *
   *   NewbieFactory.create(ApplicationModule, {swagger: {title: 'My API'}})
   */
  static async create(rootModule: unknown, options: NewbieAppOptions = {}): Promise<NewbieBootstrapResult | void> {
    // Resolve env-derived framework values from a single shared helper so
    // bootstrap and the ConfigService `framework` namespace never drift
    // apart on defaults or parsing. `options.*` overrides take precedence.
    const env = resolveFrameworkEnv();
    const environment: NewbieEnvironment = options.environment ?? env.environment;
    const port = options.port ?? env.port;
    const corsAllowedOrigins = options.corsAllowedOrigins ?? env.allowedOrigins;
    const bodyLimit = options.bodyLimit ?? "10mb";
    const requestTimeout = options.requestTimeout ?? 60_000;
    const portRaceRecovery = options.portRaceRecovery ?? environment !== "production";

    const bootstrap = async (): Promise<NewbieBootstrapResult> => {
      // [step 1] Create a nestjs application.
      // Explicitly set log levels so that verbose/debug logs (e.g. distributed
      // lock acquisitions) do not spam the console in normal runs. Set
      // LOG_LEVEL=verbose (or debug) via env to enable troubleshooting.
      const logLevels =
        options.logger ??
        (process.env.LOG_LEVEL
          ? (process.env.LOG_LEVEL.split(",").map((s) => s.trim()) as LogLevel[])
          : DEFAULT_LOG_LEVELS);
      const app = await NestFactory.create<NestExpressApplication>(rootModule as Type<any>, {
        logger: logLevels,
        // Keep the raw request body buffer on req.rawBody so that modules can
        // verify webhook HMAC signatures (e.g. module-hub's registry webhook).
        rawBody: true,
      });

      // Shutdown handlers are installed after listen() (dev: hard exit via
      // port-race; prod: bounded graceful shutdown). Both run app.close()
      // themselves, so Nest's built-in signal listeners stay disabled to
      // avoid double-registration.
      app.set("query parser", "extended");
      app.use(cookieParser());
      app.use(json({ limit: bodyLimit }));
      app.use(urlencoded({ limit: bodyLimit, extended: true }));
      // Monitor SDKs reporting via navigator.sendBeacon post text/plain bodies.
      app.use(text({ type: "text/plain" }));

      // [step 2] Enable features.

      // Any-origin report endpoints (@AllowAnyOrigin) get CORS:* at the
      // Express layer, registered before the global CORS config so the origin
      // policy never overrides it. The route registry is built from controller
      // metadata by AllowAnyOriginRegistry (ADR-009 D1).
      app.use(AllowAnyOriginRegistry.handleRequest);
      app.enableCors((req, callback) => {
        if (req && AllowAnyOriginRegistry.matches(req.method, req.path)) {
          // Handled by the middleware above; origin: false prevents the
          // global cors middleware from overriding ACAO:*.
          return callback(null, { origin: false });
        }
        callback(null, { credentials: true, origin: corsAllowedOrigins });
      });

      app.useGlobalPipes(
        new ValidationPipe({
          transform: true, // auto-coerce string params to the declared DTO type
          whitelist: true, // strip properties without validation decorators
          forbidUnknownValues: true, // reject payloads with no known properties (CVE-2019-18413)
        }),
      );

      // Backend monitor probe: starts when BACKEND_MONITOR_ENDPOINT and
      // BACKEND_MONITOR_TOKEN are present. Wired here rather than in
      // step 4 because global interceptors must be registered before listen.
      const backendMonitorEndpoint = process.env.BACKEND_MONITOR_ENDPOINT;
      const backendMonitorToken = process.env.BACKEND_MONITOR_TOKEN;
      if (backendMonitorEndpoint && backendMonitorToken) {
        startBackendMonitoring(app, {
          endpoint: backendMonitorEndpoint,
          token: backendMonitorToken,
        });
      }

      if (environment === "production") {
        app.use(helmet());
      } else if (options.swagger !== false) {
        const swagger = (options.swagger ?? {}) as NewbieSwaggerOptions;
        const config = new DocumentBuilder()
          .setTitle(swagger.title ?? "API Document")
          .setDescription(swagger.description ?? "Welcome to the API documentation")
          .setVersion(swagger.version ?? "1.0")
          .addCookieAuth("refreshToken")
          .addBearerAuth()
          .build();
        const document = SwaggerModule.createDocument(app, config);
        const customOptions: SwaggerCustomOptions = {
          explorer: true,
          swaggerOptions: {
            persistAuthorization: true,
            tagsSorter: "alpha",
          },
          customSiteTitle: swagger.title ?? "API Document",
        };
        SwaggerModule.setup(swagger.path ?? "api", app, document, customOptions);
      }

      // [step 3] Listen port. With portRaceRecovery enabled, probe the port,
      // evict stale holders and survive `nest start --watch` port races.
      const server = portRaceRecovery
        ? await listenWithPortRaceRecovery(app, port, "0.0.0.0")
        : await app.listen(port, "0.0.0.0");
      server.timeout = requestTimeout;
      if (options.keepAliveTimeout !== undefined) {
        server.keepAliveTimeout = options.keepAliveTimeout;
      }

      if (!portRaceRecovery) {
        // Production-style shutdown: drain in-flight requests within a bounded
        // grace period and always terminate afterwards.
        registerGracefulShutdown(app, server, options.shutdownTimeoutMs ?? 10_000);
      }

      logger.log(`Application is running on: ${await app.getUrl()}`);

      // [step 4] Built-in reporters. All are env-gated, fire-and-forget and
      // idempotent: they never block or crash the host process.

      // Heartbeat liveness: starts when HEARTBEAT_ENDPOINT and HEARTBEAT_TOKEN
      // are present. Sends an immediate beat and repeats every 30s.
      const heartbeatEndpoint = process.env.HEARTBEAT_ENDPOINT;
      const heartbeatToken = process.env.HEARTBEAT_TOKEN;
      if (heartbeatEndpoint && heartbeatToken) {
        startHeartbeat({
          endpoint: heartbeatEndpoint,
          token: heartbeatToken,
          appVersion: process.env.APP_VERSION,
          env: process.env.ENVIRONMENT,
          instanceId: process.env.HOSTNAME,
        });
      }

      // Module-hub self-registration: starts when MODULE_HUB_ENDPOINT and
      // MODULE_HUB_TOKEN are present. Sends a `kind="full"` snapshot
      // immediately and `kind="ping"` every 60s.
      const moduleHubEndpoint = process.env.MODULE_HUB_ENDPOINT;
      const moduleHubToken = process.env.MODULE_HUB_TOKEN;
      if (moduleHubEndpoint && moduleHubToken) {
        startModuleHubReporting({ endpoint: moduleHubEndpoint, token: moduleHubToken });
      }

      // Dependency health reporting: checks always run; the POST step is
      // gated by HEALTH_ENDPOINT + HEALTH_TOKEN inside the SDK. Scans the DI
      // container for assembled foundation services every 30s; needs the
      // NestJS app instance, so it lives here rather than in project main.ts.
      startHealthReporting(app, {
        endpoint: process.env.HEALTH_ENDPOINT,
        token: process.env.HEALTH_TOKEN,
        appVersion: process.env.APP_VERSION,
        env: process.env.ENVIRONMENT,
      });

      return { app, server };
    };

    if (options.cluster) {
      clusterize(bootstrap);
    } else {
      return bootstrap();
    }
  }
}
