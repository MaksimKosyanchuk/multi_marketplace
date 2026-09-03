import { Injectable } from '@nestjs/common';
import { LedgerEntryType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DateFilterDto {
    from?: string;
    to?: string;
}

export interface SellerAnalytics {
    sellerId: string;
    revenue: number;
    commission: number;
    refunded: number;
    orders: number;
    completedOrders: number;
    conversion: number;
    topProducts: Array<{
        productId: string;
        productName: string;
        quantity: number;
        revenue: number;
    }>;
}

@Injectable()
export class AnalyticsService {
    private readonly TIME_ZONE = 'Europe/Kyiv';

    constructor(private readonly prisma: PrismaService) {}

    private getRevenueStatuses(): OrderStatus[] {
        return [
            OrderStatus.PROCESSING,
            OrderStatus.PARTIALLY_SHIPPED,
            OrderStatus.SHIPPED,
            OrderStatus.PARTIALLY_COMPLETED,
            OrderStatus.COMPLETED,
            OrderStatus.PARTIALLY_CANCELLED,
        ];
    }

    private buildDateFilter(
        from?: string,
        to?: string,
    ): Prisma.OrderWhereInput {
        if (!from && !to) return {};
        const createdAt: Prisma.DateTimeFilter = {};
        if (from) createdAt.gte = new Date(`${from}T00:00:00.000Z`);
        if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`);
        return { createdAt };
    }

    private formatDateToLocal(date: Date): string {
        return new Intl.DateTimeFormat('sv-SE', {
            timeZone: this.TIME_ZONE,
        }).format(date);
    }

    async getDashboardData(dto: DateFilterDto) {
        const orderFilter: Prisma.OrderWhereInput = {
            ...this.buildDateFilter(dto.from, dto.to),
            status: { in: this.getRevenueStatuses() },
        };
        const [
            orderStats,
            commissionStats,
            grossStats,
            topItems,
            commissions,
            sellerOrders,
            cartItems,
        ] = await Promise.all([
            this.prisma.order.aggregate({
                where: orderFilter,
                _count: { id: true },
                _sum: { totalAmount: true },
            }),
            this.prisma.sellerOrder.aggregate({
                where: { order: orderFilter },
                _sum: { commissionAmount: true },
            }),
            this.prisma.order.aggregate({
                where: orderFilter,
                _sum: { totalAmount: true },
            }),
            this.prisma.orderItem.groupBy({
                by: ['productId', 'productName'],
                where: { sellerOrder: { order: orderFilter } },
                _sum: { quantity: true, totalAmount: true },
                orderBy: { _sum: { quantity: 'desc' } },
                take: 5,
            }),
            this.prisma.ledgerEntry.findMany({
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
            }),
            this.prisma.sellerOrder.findMany({
                where: { order: orderFilter },
                select: {
                    sellerId: true,
                    sellerEarnings: true,
                    refundedAmount: true,
                    commissionAmount: true,
                },
            }),
            this.prisma.cartItem.count({
                where: (() => {
                    const updatedAt: Prisma.DateTimeFilter<'Cart'> = {};
                    if (dto.from)
                        updatedAt.gte = new Date(`${dto.from}T00:00:00.000Z`);
                    if (dto.to)
                        updatedAt.lte = new Date(`${dto.to}T23:59:59.999Z`);
                    return Object.keys(updatedAt).length
                        ? { cart: { updatedAt } }
                        : {};
                })(),
            }),
        ]);

        const platformRevenue = Number(
            commissionStats._sum.commissionAmount ?? 0,
        );
        const totalOrders = orderStats._count.id;
        const topProducts = topItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            totalSold: item._sum.quantity ?? 0,
            totalRevenue: Number(item._sum.totalAmount ?? 0),
        }));
        const timeline = new Map<string, { revenue: number; orders: number }>();
        for (const entry of commissions) {
            const date = this.formatDateToLocal(
                entry.sellerOrder!.order.createdAt,
            );
            const current = timeline.get(date) ?? { revenue: 0, orders: 0 };
            timeline.set(date, {
                revenue: current.revenue + Number(entry.amount),
                orders: current.orders + 1,
            });
        }
        const sellerRevenue = new Map<string, number>();
        for (const sellerOrder of sellerOrders) {
            sellerRevenue.set(
                sellerOrder.sellerId,
                (sellerRevenue.get(sellerOrder.sellerId) ?? 0) +
                    Number(sellerOrder.sellerEarnings) -
                    Number(sellerOrder.refundedAmount),
            );
        }

        return {
            summary: {
                totalRevenue: platformRevenue,
                platformCommission: platformRevenue,
                grossRevenue: Number(grossStats._sum.totalAmount ?? 0),
                totalOrders,
                averageOrderValue: totalOrders
                    ? Number(grossStats._sum.totalAmount ?? 0) / totalOrders
                    : 0,
                cartToOrderConversion: cartItems
                    ? Number((totalOrders / cartItems).toFixed(4))
                    : 0,
            },
            topProducts,
            sellerRevenue: [...sellerRevenue.entries()]
                .map(([sellerId, revenue]) => ({ sellerId, revenue }))
                .sort((a, b) => b.revenue - a.revenue),
            topSellers: [...sellerRevenue.entries()]
                .map(([sellerId, revenue]) => ({ sellerId, revenue }))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5),
            salesTimeline: [...timeline.entries()].map(([date, values]) => ({
                date,
                ...values,
            })),
        };
    }

    async generateOrdersCsv(dto: DateFilterDto): Promise<string> {
        const dashboard = await this.getDashboardData(dto);
        const orders = await this.prisma.order.findMany({
            where: this.buildDateFilter(dto.from, dto.to),
            include: { user: { select: { email: true } } },
            orderBy: { createdAt: 'desc' },
        });
        const summary = [
            'Analytics summary',
            `Platform commission,${dashboard.summary.platformCommission.toFixed(2)}`,
            `Gross revenue,${dashboard.summary.grossRevenue.toFixed(2)}`,
            `Orders,${dashboard.summary.totalOrders}`,
            `Cart to order conversion,${dashboard.summary.cartToOrderConversion}`,
            '',
            'Order ID,Date,Customer,Status,Total Amount ($)',
        ].join('\n');
        const rows = orders.map((order) => {
            const date = this.formatDateToLocal(order.createdAt);
            const time =
                new Intl.DateTimeFormat('sv-SE', {
                    timeZone: this.TIME_ZONE,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                })
                    .format(order.createdAt)
                    .split(' ')[1] || '00:00:00';
            return `"${order.id}","${date} ${time}","${order.user?.email ?? 'N/A'}","${order.status}",${Number(order.totalAmount).toFixed(2)}`;
        });
        return `${summary}\n${rows.join('\n')}`;
    }

    async getSellerAnalytics(
        sellerId: string,
        dto: DateFilterDto,
    ): Promise<SellerAnalytics> {
        const orderFilter = this.buildDateFilter(dto.from, dto.to);
        const sellerOrders = await this.prisma.sellerOrder.findMany({
            where: { sellerId, order: orderFilter },
            include: { items: true },
        });
        const revenue = sellerOrders.reduce(
            (sum, order) =>
                sum +
                Number(order.sellerEarnings) -
                Number(order.refundedAmount),
            0,
        );
        const commission = sellerOrders.reduce(
            (sum, order) => sum + Number(order.commissionAmount),
            0,
        );
        const refunded = sellerOrders.reduce(
            (sum, order) => sum + Number(order.refundedAmount),
            0,
        );
        const completedOrders = sellerOrders.filter(
            (order) => order.status === 'COMPLETED',
        ).length;
        const topProducts = new Map<
            string,
            {
                productId: string;
                productName: string;
                quantity: number;
                revenue: number;
            }
        >();
        for (const order of sellerOrders) {
            for (const item of order.items) {
                const current = topProducts.get(item.productId) ?? {
                    productId: item.productId,
                    productName: item.productName,
                    quantity: 0,
                    revenue: 0,
                };
                current.quantity += item.quantity;
                current.revenue += Number(item.totalAmount);
                topProducts.set(item.productId, current);
            }
        }
        const cartCreatedAt: Prisma.DateTimeFilter = {};
        if (dto.from) cartCreatedAt.gte = new Date(`${dto.from}T00:00:00.000Z`);
        if (dto.to) cartCreatedAt.lte = new Date(`${dto.to}T23:59:59.999Z`);
        const cartCount = await this.prisma.cartItem.count({
            where: {
                product: { sellerId },
                ...(Object.keys(cartCreatedAt).length > 0 && {
                    cart: { updatedAt: cartCreatedAt },
                }),
            },
        });
        const conversion =
            cartCount > 0
                ? Number((sellerOrders.length / cartCount).toFixed(4))
                : 0;
        return {
            sellerId,
            revenue,
            commission,
            refunded,
            orders: sellerOrders.length,
            completedOrders,
            conversion,
            topProducts: [...topProducts.values()]
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5),
        };
    }

    async getSellerRankings(dto: DateFilterDto) {
        const sellerOrders = await this.prisma.sellerOrder.findMany({
            where: { order: this.buildDateFilter(dto.from, dto.to) },
            select: {
                sellerId: true,
                sellerEarnings: true,
                refundedAmount: true,
                commissionAmount: true,
                status: true,
            },
        });
        const ranking = new Map<
            string,
            {
                sellerId: string;
                revenue: number;
                orders: number;
                completedOrders: number;
            }
        >();
        for (const order of sellerOrders) {
            const current = ranking.get(order.sellerId) ?? {
                sellerId: order.sellerId,
                revenue: 0,
                orders: 0,
                completedOrders: 0,
            };
            current.revenue +=
                Number(order.sellerEarnings) - Number(order.refundedAmount);
            current.orders += 1;
            if (order.status === 'COMPLETED') current.completedOrders += 1;
            ranking.set(order.sellerId, current);
        }
        return [...ranking.values()]
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
    }

    async generateDashboardJson(dto: DateFilterDto): Promise<string> {
        return JSON.stringify(await this.getDashboardData(dto), null, 2);
    }

    async getSellerComparison(sellerId: string, dto: DateFilterDto) {
        const current = await this.getSellerAnalytics(sellerId, dto);
        if (!dto.from || !dto.to) return { current, previous: null };
        const from = new Date(`${dto.from}T00:00:00.000Z`);
        const to = new Date(`${dto.to}T23:59:59.999Z`);
        const duration = to.getTime() - from.getTime();
        const previous = await this.getSellerAnalytics(sellerId, {
            from: new Date(from.getTime() - duration - 1)
                .toISOString()
                .slice(0, 10),
            to: new Date(from.getTime() - 1).toISOString().slice(0, 10),
        });
        return {
            current,
            previous,
            revenueChange:
                previous.revenue === 0
                    ? null
                    : (current.revenue - previous.revenue) / previous.revenue,
            ordersChange:
                previous.orders === 0
                    ? null
                    : (current.orders - previous.orders) / previous.orders,
        };
    }

    async getSellerTimeline(sellerId: string, dto: DateFilterDto) {
        const orders = await this.prisma.sellerOrder.findMany({
            where: { sellerId, order: this.buildDateFilter(dto.from, dto.to) },
            select: {
                createdAt: true,
                sellerEarnings: true,
                refundedAmount: true,
            },
            orderBy: { createdAt: 'asc' },
        });
        const timeline = new Map<string, { revenue: number; orders: number }>();
        for (const order of orders) {
            const date = this.formatDateToLocal(order.createdAt);
            const current = timeline.get(date) ?? { revenue: 0, orders: 0 };
            timeline.set(date, {
                revenue:
                    current.revenue +
                    Number(order.sellerEarnings) -
                    Number(order.refundedAmount),
                orders: current.orders + 1,
            });
        }
        return [...timeline.entries()].map(([date, values]) => ({
            date,
            ...values,
        }));
    }
}
