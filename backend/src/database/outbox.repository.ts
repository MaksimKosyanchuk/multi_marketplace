import { Inject, Injectable } from '@nestjs/common';
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

const sellerOrderDetails = {
    order: true,
    items: { include: { product: true } },
    seller: { select: { id: true, email: true, nickName: true } },
} satisfies Prisma.SellerOrderInclude;

@Injectable()
export class OutboxRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

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

    findSellerOrderByIdempotencyKey(
        idempotencyKey: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.outboxEvent.findUnique({
            where: { idempotencyKey },
            include: { sellerOrder: { include: sellerOrderDetails } },
        });
    }

    findEventIdByIdempotencyKey(
        idempotencyKey: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.outboxEvent.findUnique({
            where: { idempotencyKey },
            select: { id: true },
        });
    }
}
