import { int } from "./int.util";

/**
 * Recognised ENVIRONMENT values. `staging` is a deployed environment (behind
 * the same edge proxy as production) that ships pre-release code, so it must
 * not fall back to `development` — that would silently enable local-only
 * behaviour such as port-race recovery or auto-verified emails (ADR-048).
 */
export type FrameworkEnvironment = "production" | "staging" | "development";

const FRAMEWORK_ENVIRONMENTS: readonly FrameworkEnvironment[] = ["production", "staging", "development"];

/**
 * Environment-derived framework configuration.
 *
 * This is the single source of truth for resolving framework-level env vars.
 * Both `newbie-factory.ts` (bootstrap) and `framework.config.ts` (NestJS
 * ConfigService namespace) read from here so the two code paths can never
 * drift apart on defaults or parsing.
 *
 * `NewbieFactory.create` options (environment/port/corsAllowedOrigins) take
 * precedence over these values at bootstrap time; they are not part of the
 * env resolution.
 */
export interface FrameworkEnv {
  environment: FrameworkEnvironment;
  port: number;
  allowedOrigins: string[];
  isPrimary: boolean;
  appName: string;
  frontendUrl: string;
}

export function resolveFrameworkEnv(env: NodeJS.ProcessEnv = process.env): FrameworkEnv {
  const rawEnvironment = env.ENVIRONMENT ?? "development";
  const environment: FrameworkEnvironment = FRAMEWORK_ENVIRONMENTS.includes(rawEnvironment as FrameworkEnvironment)
    ? (rawEnvironment as FrameworkEnvironment)
    : "development";
  if (environment === "development" && rawEnvironment !== "development") {
    // Cannot import the framework logger here (it is created later in
    // NewbieFactory); fall back to console.warn for this one-off validation.
    console.warn(`Invalid ENVIRONMENT "${rawEnvironment}"; falling back to "development"`);
  }

  return {
    environment,
    port: int(env.PORT, 3000),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(","),
    isPrimary: int(env.SERVER_SERIAL_NUMBER, 0) === 1,
    appName: env.APP_NAME || "Newbie",
    frontendUrl: env.APP_FRONTEND_URL || "http://localhost:3001",
  };
}
