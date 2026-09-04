import { Inject, Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

@Injectable()
export class AnalyticsRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    aggregateOrders(
        where: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.aggregate({
            where,
            _count: { id: true },
            _sum: { totalAmount: true },
        });
    }

    aggregateSellerOrderCommission(
        orderFilter: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.aggregate({
            where: { order: orderFilter },
            _sum: { commissionAmount: true },
        });
    }

    groupTopOrderItems(
        orderFilter: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.orderItem.groupBy({
            by: ['productId', 'productName'],
            where: { sellerOrder: { order: orderFilter } },
            _sum: { quantity: true, totalAmount: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5,
        });
    }

    findCommissionLedger(
        orderFilter: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.ledgerEntry.findMany({
            where: {
                type: LedgerEntryType.PLATFORM_COMMISSION,
                sellerOrder: { order: orderFilter },
            },
            select: {
                amount: true,
                sellerOrder: {
                    select: { order: { select: { createdAt: true } } },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    findSellerOrdersForDashboard(
        orderFilter: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findMany({
            where: { order: orderFilter },
            select: {
                sellerId: true,
                sellerEarnings: true,
                refundedAmount: true,
                commissionAmount: true,
            },
        });
    }

    countCartItems(
        where: Prisma.CartItemWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.cartItem.count({ where });
    }

    findOrdersForExport(
        where: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.order.findMany({
            where,
            include: { user: { select: { email: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    findSellerOrdersWithItems(
        sellerId: string,
        orderFilter: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findMany({
            where: { sellerId, order: orderFilter },
            include: { items: true },
        });
    }

    findSellerOrdersForRanking(
        orderFilter: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findMany({
            where: { order: orderFilter },
            select: {
                sellerId: true,
                sellerEarnings: true,
                refundedAmount: true,
                commissionAmount: true,
                status: true,
            },
        });
    }

    findSellerOrdersForTimeline(
        sellerId: string,
        orderFilter: Prisma.OrderWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.sellerOrder.findMany({
            where: { sellerId, order: orderFilter },
            select: {
                createdAt: true,
                sellerEarnings: true,
                refundedAmount: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }
}
