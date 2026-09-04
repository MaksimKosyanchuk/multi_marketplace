import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, Prisma } from '@prisma/client';
import { AnalyticsRepository } from '../database/analytics.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
    let service: AnalyticsService;
    const prisma = {
        order: { aggregate: jest.fn(), findMany: jest.fn() },
        sellerOrder: { aggregate: jest.fn(), findMany: jest.fn() },
        orderItem: { groupBy: jest.fn() },
        ledgerEntry: { aggregate: jest.fn(), findMany: jest.fn() },
        cartItem: { count: jest.fn() },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalyticsService,
                AnalyticsRepository,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(AnalyticsService);
        jest.clearAllMocks();
    });

    it('returns empty analytics when there are no revenue entries', async () => {
        prisma.order.aggregate.mockResolvedValue({
            _count: { id: 0 },
            _sum: { totalAmount: null },
        });
        prisma.sellerOrder.aggregate.mockResolvedValue({
            _sum: { commissionAmount: null },
        });
        prisma.ledgerEntry.aggregate.mockResolvedValue({
            _sum: { amount: null },
        });
        prisma.orderItem.groupBy.mockResolvedValue([]);
        prisma.ledgerEntry.findMany.mockResolvedValue([]);
        prisma.sellerOrder.findMany.mockResolvedValue([]);
        prisma.cartItem.count.mockResolvedValue(0);

        await expect(service.getDashboardData({})).resolves.toEqual({
            summary: {
                totalRevenue: 0,
                platformCommission: 0,
                grossRevenue: 0,
                totalOrders: 0,
                averageOrderValue: 0,
                cartToOrderConversion: 0,
            },
            topProducts: [],
            sellerRevenue: [],
            topSellers: [],
            salesTimeline: [],
        });
        expect(prisma.sellerOrder.aggregate).toHaveBeenCalled();
    });

    it('uses commission ledger entries and immutable item totals', async () => {
        prisma.order.aggregate.mockResolvedValue({ _count: { id: 2 } });
        prisma.sellerOrder.aggregate.mockResolvedValue({
            _sum: { commissionAmount: new Prisma.Decimal(30) },
        });
        prisma.order.aggregate
            .mockResolvedValueOnce({
                _count: { id: 2 },
                _sum: { totalAmount: new Prisma.Decimal(300) },
            })
            .mockResolvedValueOnce({
                _sum: { totalAmount: new Prisma.Decimal(300) },
            });
        prisma.ledgerEntry.aggregate.mockResolvedValue({
            _sum: { amount: new Prisma.Decimal(30) },
        });
        prisma.orderItem.groupBy.mockResolvedValue([
            {
                productId: 'product-1',
                productName: 'Keyboard',
                _sum: { quantity: 3, totalAmount: new Prisma.Decimal(300) },
            },
        ]);
        prisma.ledgerEntry.findMany.mockResolvedValue([
            {
                amount: new Prisma.Decimal(10),
                sellerOrder: {
                    order: { createdAt: new Date('2026-07-10T10:00:00.000Z') },
                },
            },
            {
                amount: new Prisma.Decimal(20),
                sellerOrder: {
                    order: { createdAt: new Date('2026-07-10T14:00:00.000Z') },
                },
            },
        ]);
        prisma.sellerOrder.findMany.mockResolvedValue([]);
        prisma.cartItem.count.mockResolvedValue(0);

        const result = await service.getDashboardData({
            from: '2026-07-01',
            to: '2026-07-31',
        });
        expect(result.summary).toEqual({
            totalRevenue: 30,
            platformCommission: 30,
            grossRevenue: 300,
            totalOrders: 2,
            averageOrderValue: 150,
            cartToOrderConversion: 0,
        });
        expect(result.topProducts).toEqual([
            {
                productId: 'product-1',
                productName: 'Keyboard',
                totalSold: 3,
                totalRevenue: 300,
            },
        ]);
        expect(result.salesTimeline).toEqual([
            { date: '2026-07-10', revenue: 30, orders: 2 },
        ]);
    });

    it('exports orders, retaining rows without a customer relation', async () => {
        prisma.order.aggregate
            .mockResolvedValueOnce({
                _count: { id: 0 },
                _sum: { totalAmount: null },
            })
            .mockResolvedValueOnce({
                _sum: { totalAmount: null },
            });
        prisma.sellerOrder.aggregate.mockResolvedValue({
            _sum: { commissionAmount: null },
        });
        prisma.ledgerEntry.findMany.mockResolvedValue([]);
        prisma.sellerOrder.findMany.mockResolvedValue([]);
        prisma.orderItem.groupBy.mockResolvedValue([]);
        prisma.cartItem.count.mockResolvedValue(0);
        prisma.order.findMany.mockResolvedValue([
            {
                id: 'order-1',
                createdAt: new Date('2026-08-15T12:34:56.000Z'),
                status: OrderStatus.NEW,
                totalAmount: new Prisma.Decimal(45),
                user: null,
            },
        ]);
        prisma.sellerOrder.findMany.mockResolvedValue([]);
        prisma.cartItem.count.mockResolvedValue(0);
        await expect(service.generateOrdersCsv({})).resolves.toContain(
            '"N/A","NEW",45.00',
        );
    });
});
