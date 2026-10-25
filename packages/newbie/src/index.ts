/**
 * @devbie/newbie public entry.
 */

// Published package version (single source of truth in ./version.ts).
export { VERSION } from "./version";

// Application bootstrap
export * from "./newbie-factory";
export * from "./port-race";
export * from "./graceful-shutdown";

// Framework module & configuration
export * from "./framework.module";
export * from "./framework.config";

// Shared DTOs
export * from "./common.dto";

// Decorators
export * from "./decorators/cookie.decorator";
export * from "./cors/allow-any-origin.decorator";
export * from "./cors/allow-any-origin.registry";

// Exception filters
export * from "./exception-filters/all.exception-filter";
export * from "./exception-filters/http.exception-filter";
export * from "./exception-filters/newbie.exception-filter";
export * from "./exception-filters/prisma.exception-filter";
export * from "./exception-filters/throttler.exception-filter";

// Exceptions & error constants (superset)
export * from "./exceptions/newbie.exception";
export * from "./exceptions/errors.constants";

// Interceptors & middlewares
export * from "./interceptors/http-response.interceptor";
export * from "./middlewares/http.middleware";
export * from "./middlewares/raw-body.middleware";

// Built-in module-hub reporter (env-gated; no-op without MODULE_HUB_*)
export * from "./module-hub/reporter";
export * from "./module-hub/snapshot";

// Pipes (their local errors.constants is subpath-only, see note above)
export * from "./pipes/cursor-slug.pipe";
export * from "./pipes/cursor.pipe";
export * from "./pipes/order-by.pipe";
export * from "./pipes/select-include.pipe";
export * from "./pipes/where.pipe";

// Prisma
export * from "./prisma/prisma.exception";
export * from "./prisma/prisma.extension";
export * from "./prisma/prisma.module";
export * from "./prisma/prisma.service";

// Transformers
export * from "./transformers/boolean.transformer";

// Utilities
export * from "./utilities/array.util";
export * from "./utilities/bool.util";
export * from "./utilities/common.util";
export * from "./utilities/crypto.util";
export * from "./utilities/datetime.util";
export * from "./utilities/delay.util";
export * from "./utilities/file.util";
export * from "./utilities/int.util";
export * from "./utilities/parse-object-literal.util";
export * from "./utilities/random.util";
export * from "./utilities/sse.util";
export * from "./utilities/timezone.util";
