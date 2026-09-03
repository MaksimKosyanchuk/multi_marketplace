import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

const orderDetails = {
    sellerOrders: {
        include: {
            seller: { select: { id: true, email: true, nickName: true } },
            items: true,
        },
    },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OutboxRepository {
    constructor(private readonly prisma: PrismaService) {}

    create(
        data: Prisma.OutboxEventCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.outboxEvent.create({ data });
    }

    createMany(
        data: Prisma.OutboxEventCreateManyInput[],
        db: DatabaseClient = this.prisma,
    ) {
        return db.outboxEvent.createMany({ data });
    }

    findByIdempotencyKey(
        idempotencyKey: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.outboxEvent.findUnique({
            where: { idempotencyKey },
            include: { order: { include: orderDetails } },
        });
    }
}
