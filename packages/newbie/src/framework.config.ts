import { registerAs } from "@nestjs/config";
import { resolveFrameworkEnv } from "./utilities/framework-env.util";

export default registerAs("framework", () => {
  const env = resolveFrameworkEnv();
  return {
    environment: env.environment,
    server: {
      port: env.port,
      allowedOrigins: env.allowedOrigins,
      isPrimary: env.isPrimary,
      httpTimeout: 60000, // milliseconds
    },
    app: {
      name: env.appName,
      frontendUrl: env.frontendUrl,
    },
  };
});
