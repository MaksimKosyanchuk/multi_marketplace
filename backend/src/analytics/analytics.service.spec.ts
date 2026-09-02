import { Test, TestingModule } from '@nestjs/testing';
import { LedgerEntryType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
    let service: AnalyticsService;
    const prisma = {
        order: { aggregate: jest.fn(), findMany: jest.fn() },
        orderItem: { groupBy: jest.fn() },
        ledgerEntry: { aggregate: jest.fn(), findMany: jest.fn() },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        service = module.get(AnalyticsService);
        jest.clearAllMocks();
    });

    it('returns empty analytics when there are no revenue entries', async () => {
        prisma.order.aggregate.mockResolvedValue({ _count: { id: 0 } });
        prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: null } });
        prisma.orderItem.groupBy.mockResolvedValue([]);
        prisma.ledgerEntry.findMany.mockResolvedValue([]);

        await expect(service.getDashboardData({})).resolves.toEqual({
            summary: { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 },
            topProducts: [], salesTimeline: [],
        });
        expect(prisma.ledgerEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ type: LedgerEntryType.PLATFORM_COMMISSION }),
        }));
    });

    it('uses commission ledger entries and immutable item totals', async () => {
        prisma.order.aggregate.mockResolvedValue({ _count: { id: 2 } });
        prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(30) } });
        prisma.orderItem.groupBy.mockResolvedValue([{ productId: 'product-1', productName: 'Keyboard', _sum: { quantity: 3, totalAmount: new Prisma.Decimal(300) } }]);
        prisma.ledgerEntry.findMany.mockResolvedValue([
            { amount: new Prisma.Decimal(10), sellerOrder: { order: { createdAt: new Date('2026-07-10T10:00:00.000Z') } } },
            { amount: new Prisma.Decimal(20), sellerOrder: { order: { createdAt: new Date('2026-07-10T14:00:00.000Z') } } },
        ]);

        const result = await service.getDashboardData({ from: '2026-07-01', to: '2026-07-31' });
        expect(result.summary).toEqual({ totalRevenue: 30, totalOrders: 2, averageOrderValue: 15 });
        expect(result.topProducts).toEqual([{ productId: 'product-1', productName: 'Keyboard', totalSold: 3, totalRevenue: 300 }]);
        expect(result.salesTimeline).toEqual([{ date: '2026-07-10', revenue: 30, orders: 2 }]);
    });

    it('exports orders, retaining rows without a customer relation', async () => {
        prisma.order.findMany.mockResolvedValue([{ id: 'order-1', createdAt: new Date('2026-08-15T12:34:56.000Z'), status: OrderStatus.NEW, totalAmount: new Prisma.Decimal(45), user: null }]);
        await expect(service.generateOrdersCsv({})).resolves.toContain('"N/A","NEW",45.00');
    });
});
