import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class LogRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    create(
        data: {
            level: string;
            context: string;
            message: string;
            correlationId?: string | null;
            meta?: Prisma.InputJsonValue;
        },
        db: DatabaseClient = this.prisma,
    ) {
        return db.log.create({ data });
    }
}
