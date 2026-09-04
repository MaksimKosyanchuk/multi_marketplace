import { Inject, Injectable } from '@nestjs/common';
import { DisputeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

const disputeListInclude = {
    sellerOrder: {
        include: {
            order: {
                include: {
                    user: { select: { id: true, nickName: true } },
                },
            },
            seller: { select: { id: true, nickName: true } },
            items: true,
        },
    },
    openedBy: { select: { id: true, nickName: true } },
    resolvedBy: { select: { id: true, nickName: true } },
    history: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.DisputeInclude;

@Injectable()
export class DisputeRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findActiveForSellerOrder(
        sellerOrderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.dispute.findFirst({
            where: {
                sellerOrderId,
                status: {
                    in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW],
                },
            },
        });
    }

    create(
        data: Prisma.DisputeCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.dispute.create({ data });
    }

    createHistory(
        data: Prisma.DisputeHistoryCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.disputeHistory.create({ data });
    }

    list(where: Prisma.DisputeWhereInput, db: DatabaseClient = this.prisma) {
        return db.dispute.findMany({
            where,
            include: disputeListInclude,
            orderBy: { createdAt: 'desc' },
        });
    }

    findByIdForResolve(id: string, db: DatabaseClient = this.prisma) {
        return db.dispute.findUnique({
            where: { id },
            include: {
                sellerOrder: {
                    include: {
                        items: true,
                        order: { include: { payments: true } },
                    },
                },
            },
        });
    }

    update(
        id: string,
        data: Prisma.DisputeUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.dispute.update({ where: { id }, data });
    }
}
