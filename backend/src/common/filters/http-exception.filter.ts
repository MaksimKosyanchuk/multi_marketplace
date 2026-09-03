import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '../../logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    constructor(private readonly logger: LoggerService) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const exceptionResponse =
            exception instanceof HttpException ? exception.getResponse() : null;

        const message =
            typeof exceptionResponse === 'string'
                ? exceptionResponse
                : exceptionResponse &&
                    typeof exceptionResponse === 'object' &&
                    'message' in exceptionResponse
                  ? (exceptionResponse as { message: string | string[] })
                        .message
                  : 'Internal server error';

        if (status >= 500) {
            void this.logger.error(
                AllExceptionsFilter.name,
                'Unhandled HTTP exception',
                {
                    method: request.method,
                    path: request.url,
                    statusCode: status,
                    error:
                        exception instanceof Error
                            ? exception.message
                            : String(exception),
                    ...(exception instanceof Error && exception.stack
                        ? { stack: exception.stack }
                        : {}),
                },
            );
        } else {
            void this.logger.warn(
                AllExceptionsFilter.name,
                'HTTP client error',
                {
                    method: request.method,
                    path: request.url,
                    statusCode: status,
                    message,
                },
            );
        }

        response.status(status).json({
            statusCode: status,
            message,
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }
}
