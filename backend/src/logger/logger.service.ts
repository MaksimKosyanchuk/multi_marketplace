import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getCorrelationId } from '../common/correlation/correlation.context';

@Injectable()
export class LoggerService {
    constructor(private readonly prisma: PrismaService) {}

    async log(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb('INFO', context, message, this.withCorrelation(meta));
    }

    async warn(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb('WARN', context, message, this.withCorrelation(meta));
    }

    async error(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb('ERROR', context, message, this.withCorrelation(meta));
    }

    private withCorrelation(meta?: Prisma.InputJsonValue): Prisma.InputJsonValue {
        return {
            ...(meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}),
            correlationId: getCorrelationId(),
        } as Prisma.InputJsonObject;
    }

    private async saveToDb(
        level: string,
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        const correlationId = getCorrelationId();
        try {
            await this.prisma.log.create({
                data: {
                    level,
                    context,
                    message,
                    correlationId,
                    meta,
                },
            });
        } catch (error: unknown) {
            console.error('Failed to write log to DB:', error);
        }
    }
}
