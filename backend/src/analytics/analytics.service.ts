import { Injectable } from '@nestjs/common';
import { LedgerEntryType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DateFilterDto {
    from?: string;
    to?: string;
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
        ];
    }

    private buildDateFilter(from?: string, to?: string): Prisma.OrderWhereInput {
        if (!from && !to) return {};
        const createdAt: Prisma.DateTimeFilter = {};
        if (from) createdAt.gte = new Date(`${from}T00:00:00.000Z`);
        if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`);
        return { createdAt };
    }

    private formatDateToLocal(date: Date): string {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: this.TIME_ZONE }).format(date);
    }

    async getDashboardData(dto: DateFilterDto) {
        const orderFilter: Prisma.OrderWhereInput = {
            ...this.buildDateFilter(dto.from, dto.to),
            status: { in: this.getRevenueStatuses() },
        };
        const [orderStats, commissionStats, topItems, commissions] = await Promise.all([
            this.prisma.order.aggregate({ where: orderFilter, _count: { id: true } }),
            this.prisma.ledgerEntry.aggregate({
                where: {
                    type: LedgerEntryType.PLATFORM_COMMISSION,
                    sellerOrder: { order: orderFilter },
                },
                _sum: { amount: true },
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
                    sellerOrder: { select: { order: { select: { createdAt: true } } } },
                },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        const platformRevenue = Number(commissionStats._sum.amount ?? 0);
        const totalOrders = orderStats._count.id;
        const topProducts = topItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            totalSold: item._sum.quantity ?? 0,
            totalRevenue: Number(item._sum.totalAmount ?? 0),
        }));
        const timeline = new Map<string, { revenue: number; orders: number }>();
        for (const entry of commissions) {
            const date = this.formatDateToLocal(entry.sellerOrder!.order.createdAt);
            const current = timeline.get(date) ?? { revenue: 0, orders: 0 };
            timeline.set(date, { revenue: current.revenue + Number(entry.amount), orders: current.orders + 1 });
        }

        return {
            summary: {
                totalRevenue: platformRevenue,
                totalOrders,
                averageOrderValue: totalOrders ? platformRevenue / totalOrders : 0,
            },
            topProducts,
            salesTimeline: [...timeline.entries()].map(([date, values]) => ({ date, ...values })),
        };
    }

    async generateOrdersCsv(dto: DateFilterDto): Promise<string> {
        const orders = await this.prisma.order.findMany({
            where: this.buildDateFilter(dto.from, dto.to),
            include: { user: { select: { email: true } } },
            orderBy: { createdAt: 'desc' },
        });
        const header = 'Order ID,Date,Customer,Status,Total Amount ($)\n';
        const rows = orders.map((order) => {
            const date = this.formatDateToLocal(order.createdAt);
            const time = new Intl.DateTimeFormat('sv-SE', {
                timeZone: this.TIME_ZONE,
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            }).format(order.createdAt).split(' ')[1] || '00:00:00';
            return `"${order.id}","${date} ${time}","${order.user?.email ?? 'N/A'}","${order.status}",${Number(order.totalAmount).toFixed(2)}`;
        });
        return header + rows.join('\n');
    }
}
