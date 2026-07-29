import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ERROR_CODES, HTTP_STATUS } from '@echolife/shared';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor() {
    // Read NODE_ENV at filter instantiation time
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: number = ERROR_CODES.INTERNAL_ERROR;
    let message = 'Internal server error';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        code = typeof resp.code === 'number' ? resp.code : status * 100;
        message = (resp.message as string) || exception.message;
        details = resp.details as Record<string, unknown>;
      } else {
        message = exceptionResponse as string;
        code = status * 100;
      }
    } else if (exception instanceof Error) {
      // In production, mask internal error details to prevent information leakage
      if (this.isProduction) {
        message = '服务器内部错误，请稍后重试';
      } else {
        message = exception.message;
      }
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    const httpStatus = HTTP_STATUS[code] || status;

    const errorResponse = {
      code,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      traceId: request.headers['x-request-id'] as string,
    };

    response.status(httpStatus).json(errorResponse);
  }
}
