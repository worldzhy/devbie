import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/client";
import { getPrismaExceptionMessage } from "../prisma/prisma.exception";

enum PrismaExceptionCode {
  PrismaClientKnownRequestError = 9001,
  PrismaClientUnknownRequestError = 9002,
  PrismaClientInitializationError = 9003,
  PrismaClientValidationError = 9004,
}

/**
 * Error classes come from `@prisma/client/runtime/client`, which is the same
 * runtime used by every project-generated client (prisma-client generator),
 * so instanceof matches errors thrown from the consumer's generated client.
 *
 * @see [PrismaErrors] https://www.prisma.io/docs/reference/api-reference/error-reference#error-codes
 */
@Catch(
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    // Fail closed: a branch that does not assign a status is a server fault,
    // never a 200 success (see ADR-001 addendum).
    let statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

    /*
     * PrismaClientKnownRequestError
     * Engine returns a known error related to the request
     */
    if (exception instanceof PrismaClientKnownRequestError) {
      const { code, message } = exception;
      if (code === "P2025") {
        // Record(s) required by the operation were not found — a client-visible
        // "does not exist", not a malformed request.
        statusCode = HttpStatus.NOT_FOUND;
      } else if (code.startsWith("P2")) {
        statusCode = HttpStatus.BAD_REQUEST;
      } else {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      }

      response.status(statusCode).json({
        code: PrismaExceptionCode.PrismaClientKnownRequestError,
        error: { message: code + " " + getPrismaExceptionMessage(code, message) },
        data: null,
      });
    } else if (exception instanceof PrismaClientUnknownRequestError) {
      /*
       * PrismaClientUnknownRequestError
       * Engine returns an error related to a request that does not have an error code.
       * No client-fixable error code means a server-side fault: respond 500.
       */
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        code: PrismaExceptionCode.PrismaClientUnknownRequestError,
        error: { message: exception.message },
        data: null,
      });
    } else if (exception instanceof PrismaClientInitializationError) {
      /*
       * PrismaClientInitializationError
       * Something goes wrong when the query engine is started and the connection to the database is created
       */
      const { message } = exception;
      const code = exception.errorCode;
      if (code && code.startsWith("P2")) {
        statusCode = HttpStatus.BAD_REQUEST;
      } else {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      }

      response.status(statusCode).json({
        code: PrismaExceptionCode.PrismaClientInitializationError,
        error: { message: code + " " + getPrismaExceptionMessage(code, message) },
        data: null,
      });
    } else if (exception instanceof PrismaClientValidationError) {
      /*
       * PrismaClientValidationError
       * Validation fails
       */
      response.status(HttpStatus.BAD_REQUEST).json({
        code: PrismaExceptionCode.PrismaClientValidationError,
        error: {
          message: "Validation failed due to missing field, incorrect field name, incorrect field types, etc.",
        },
        data: null,
      });
    } else if (exception instanceof PrismaClientRustPanicError) {
      /*
       * PrismaClientRustPanicError
       * The underlying engine crashed; the client can no longer be used.
       * Return 500 and let the caller retry against a fresh client.
       */
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        code: 9005,
        error: { message: "Database engine crashed; please retry the request." },
        data: null,
      });
    }
  }
}
