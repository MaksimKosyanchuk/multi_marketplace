import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';

export interface DateFilterDto {
    from?: string;
    to?: string;
}

@Injectable()
export class AnalyticsService {
    private readonly TIME_ZONE = 'Europe/Kyiv';

    constructor(private readonly prisma: PrismaService) {}

    private getPaidStatuses(): OrderStatus[] {
        return [
            OrderStatus.NEW,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
            OrderStatus.COMPLETED,
        ];
    }

    private buildDateFilter(
        from?: string,
        to?: string,
    ): Prisma.OrderWhereInput {
        if (!from && !to) {
            return {};
        }

        const createdAtFilter: Prisma.DateTimeFilter = {};

        if (from) {
            createdAtFilter.gte = new Date(`${from}T00:00:00.000Z`);
        }
        if (to) {
            createdAtFilter.lte = new Date(`${to}T23:59:59.999Z`);
        }

        return { createdAt: createdAtFilter };
    }

    private formatDateToLocal(date: Date): string {
        return new Intl.DateTimeFormat('sv-SE', {
            timeZone: this.TIME_ZONE,
        }).format(date);
    }

    async getDashboardData(dto: DateFilterDto) {
        const dateFilter = this.buildDateFilter(dto.from, dto.to);
        const paidStatuses = this.getPaidStatuses();

        const summaryAgg = await this.prisma.order.aggregate({
            where: {
                ...dateFilter,
                status: { in: paidStatuses },
            },
            _sum: { totalAmount: true },
            _count: { id: true },
        });

        const totalRevenue = Number(summaryAgg._sum.totalAmount || 0);
        const totalOrders = summaryAgg._count.id;
        const averageOrderValue =
            totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const topItems = await this.prisma.orderItem.groupBy({
            by: ['productId', 'productName'],
            where: {
                order: {
                    ...dateFilter,
                    status: { in: paidStatuses },
                },
            },
            _sum: {
                quantity: true,
                price: true,
            },
            orderBy: {
                _sum: {
                    quantity: 'desc',
                },
            },
            take: 5,
        });

        const topProducts = topItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            totalSold: item._sum.quantity || 0,
            totalRevenue: Number(item._sum.price || 0),
        }));

        const orders = await this.prisma.order.findMany({
            where: {
                ...dateFilter,
                status: { in: paidStatuses },
            },
            select: {
                createdAt: true,
                totalAmount: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        const timelineMap = new Map<
            string,
            { revenue: number; orders: number }
        >();

        orders.forEach((ord) => {
            const dateKey = this.formatDateToLocal(ord.createdAt);
            const existing = timelineMap.get(dateKey) || {
                revenue: 0,
                orders: 0,
            };
            timelineMap.set(dateKey, {
                revenue: existing.revenue + Number(ord.totalAmount),
                orders: existing.orders + 1,
            });
        });

        const salesTimeline = Array.from(timelineMap.entries()).map(
            ([date, data]) => ({
                date,
                revenue: data.revenue,
                orders: data.orders,
            }),
        );

        return {
            summary: {
                totalRevenue,
                totalOrders,
                averageOrderValue,
            },
            topProducts,
            salesTimeline,
        };
    }

    async generateOrdersCsv(dto: DateFilterDto): Promise<string> {
        const dateFilter = this.buildDateFilter(dto.from, dto.to);

        const orders = await this.prisma.order.findMany({
            where: dateFilter,
            include: {
                user: { select: { email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const header = 'Order ID,Date,Customer,Status,Total Amount ($)\n';
        const rows = orders
            .map((o) => {
                const localDate = this.formatDateToLocal(o.createdAt);
                const localTime =
                    new Intl.DateTimeFormat('sv-SE', {
                        timeZone: this.TIME_ZONE,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                    })
                        .format(o.createdAt)
                        .split(' ')[1] || '00:00:00';

                const fullFormattedDate = `${localDate} ${localTime}`;

                return `"${o.id}","${fullFormattedDate}","${o.user?.email || 'N/A'}","${o.status}",${Number(o.totalAmount).toFixed(2)}`;
            })
            .join('\n');

        return header + rows;
    }
}
