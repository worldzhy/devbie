import { Logger, Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class HttpMiddleware implements NestMiddleware {
  private loggerContext = "HttpMiddleware";

  constructor(private readonly logger: Logger) {}

  use(request: Request, response: Response, next: NextFunction) {
    const startDate = new Date();

    response.on("finish", () => {
      // Whitelist of logged fields only. Credentials (Authorization / API key
      // headers) and request bodies are deliberately excluded: tokens can be
      // replayed from logs and bodies routinely carry passwords.
      const logObj = {
        date: startDate,
        duration: new Date().getTime() - startDate.getTime(),
        method: request.method,
        // Path only: query strings routinely carry tokens and one-time codes.
        path: request.path,
        status: response.statusCode,
      };

      this.logger.log(JSON.stringify(logObj), this.loggerContext);
    });

    next();
  }
}
