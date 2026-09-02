import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoggerService {
    constructor(private readonly prisma: PrismaService) {}

    async log(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb('INFO', context, message, meta);
    }

    async warn(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb('WARN', context, message, meta);
    }

    async error(
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        await this.saveToDb('ERROR', context, message, meta);
    }

    private async saveToDb(
        level: string,
        context: string,
        message: string,
        meta?: Prisma.InputJsonValue,
    ): Promise<void> {
        try {
            await this.prisma.log.create({
                data: {
                    level,
                    context,
                    message,
                    meta,
                },
            });
        } catch (error: unknown) {
            console.error('Failed to write log to DB:', error);
        }
    }
}
