import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogRepository } from '../database/log.repository';
import { getCorrelationId } from '../common/correlation/correlation.context';

export type LogMetadata = Record<string, unknown>;

@Injectable()
export class LoggerService {
    constructor(private readonly logs: LogRepository) {}

    log(context: string, message: string, meta?: Prisma.InputJsonValue): void {
        this.saveToDb('INFO', context, message, this.withCorrelation(meta));
    }

    warn(context: string, message: string, meta?: Prisma.InputJsonValue): void {
        this.saveToDb('WARN', context, message, this.withCorrelation(meta));
    }

    error(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): void {
        this.saveToDb('ERROR', context, message, this.withCorrelation(meta));
    }

    debug(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): void {
        this.saveToDb('DEBUG', context, message, this.withCorrelation(meta));
    }

    audit(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): void {
        this.saveToDb('AUDIT', context, message, this.withCorrelation(meta));
    }

    private withCorrelation(
        meta?: Prisma.InputJsonValue,
    ): Prisma.InputJsonValue {
        return {
            ...(meta && typeof meta === 'object' && !Array.isArray(meta)
                ? meta
                : {}),
            correlationId: getCorrelationId(),
        };
    }

    private saveToDb(
        level: string,
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): void {
        const correlationId = getCorrelationId();
        void this.logs
            .create({
                level,
                context,
                message,
                correlationId,
                meta,
            })
            .catch((error: unknown) => {
                console.error('[logger] Failed to write log to DB', {
                    context,
                    level,
                    correlationId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            });
    }
}
