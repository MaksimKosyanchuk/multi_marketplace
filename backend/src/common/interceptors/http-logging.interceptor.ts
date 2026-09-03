import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { LoggerService } from '../../logger/logger.service';
import { getCorrelationId } from '../correlation/correlation.context';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
    constructor(private readonly logger: LoggerService) {}

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const req = context.switchToHttp().getRequest<Request>();
        const res = context.switchToHttp().getResponse<Response>();
        const startedAt = Date.now();
        return next.handle().pipe(
            tap({
                next: () => {
                    const statusCode = res.statusCode;
                    const method = req.method;
                    const metadata = {
                        method,
                        path: req.originalUrl ?? req.url,
                        statusCode,
                        durationMs: Date.now() - startedAt,
                        correlationId: getCorrelationId(),
                    };
                    void (statusCode >= 400
                        ? this.logger.warn(
                              'HTTP',
                              'HTTP request failed',
                              metadata,
                          )
                        : this.logger.debug(
                              'HTTP',
                              'HTTP request completed',
                              metadata,
                          ));
                },
                error: (error: unknown) => {
                    void this.logger.error('HTTP', 'HTTP request error', {
                        method: req.method,
                        path: req.originalUrl ?? req.url,
                        statusCode:
                            res.statusCode >= 400 ? res.statusCode : 500,
                        durationMs: Date.now() - startedAt,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                },
            }),
        );
    }
}
