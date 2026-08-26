import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

// Stable error shape, never leaks internals. See backend.md, "Error
// handling". Refined with the ApiErrorCode union from packages/contracts in
// a later phase; this is the Phase 0 foundation main.ts wires up.
interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ApiErrorBody = {
      statusCode,
      error: 'InternalServerError',
      message: 'Something went wrong. Try again.',
    };

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        body.message = payload;
        body.error = exception.name;
      } else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        body.error = typeof p.error === 'string' ? p.error : exception.name;
        body.message = Array.isArray(p.message)
          ? p.message.join(', ')
          : typeof p.message === 'string'
            ? p.message
            : body.message;
      }
    }

    response.status(statusCode).json(body);
  }
}
