import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getCorrelationId } from '../common/correlation/correlation.context';

export type LogMetadata = Record<string, unknown>;

@Injectable()
export class LoggerService {
    constructor(private readonly prisma: PrismaService) {}

    async log(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb(
            'INFO',
            context,
            message,
            this.withCorrelation(meta),
        );
    }

    async warn(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb(
            'WARN',
            context,
            message,
            this.withCorrelation(meta),
        );
    }

    async error(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb(
            'ERROR',
            context,
            message,
            this.withCorrelation(meta),
        );
    }

    async debug(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb(
            'DEBUG',
            context,
            message,
            this.withCorrelation(meta),
        );
    }

    async audit(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb(
            'AUDIT',
            context,
            message,
            this.withCorrelation(meta),
        );
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
        void this.prisma.log
            .create({
                data: {
                    level,
                    context,
                    message,
                    correlationId,
                    meta,
                },
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
