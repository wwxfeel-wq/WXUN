import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Response } from 'express';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Skip SSE streams and non-JSON responses
    const contentType = response.getHeader('Content-Type');
    if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // If data is already in the standard format, return as-is
        if (data && typeof data === 'object' && 'code' in data && 'data' in data) {
          return data;
        }

        // Wrap in standard response format
        return {
          code: 0,
          message: 'success',
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
