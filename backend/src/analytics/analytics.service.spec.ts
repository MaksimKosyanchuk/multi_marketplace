import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';

describe('AnalyticsService', () => {
    let service: AnalyticsService;
    let prismaService: PrismaService;

    const mockPrismaService = {
        order: {
            aggregate: jest.fn(),
            findMany: jest.fn(),
        },
        orderItem: {
            groupBy: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalyticsService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
            ],
        }).compile();

        service = module.get<AnalyticsService>(AnalyticsService);
        prismaService = module.get<PrismaService>(PrismaService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getDashboardData', () => {
        it('should return default summary, empty top products, and empty timeline when no data is returned', async () => {
            mockPrismaService.order.aggregate.mockResolvedValue({
                _sum: { totalAmount: null },
                _count: { id: 0 },
            });
            mockPrismaService.orderItem.groupBy.mockResolvedValue([]);
            mockPrismaService.order.findMany.mockResolvedValue([]);

            const result = await service.getDashboardData({});

            expect(result).toEqual({
                summary: {
                    totalRevenue: 0,
                    totalOrders: 0,
                    averageOrderValue: 0,
                },
                topProducts: [],
                salesTimeline: [],
            });

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(prismaService.order.aggregate).toHaveBeenCalledWith({
                where: {
                    status: {
                        in: [
                            OrderStatus.NEW,
                            OrderStatus.PROCESSING,
                            OrderStatus.SHIPPED,
                            OrderStatus.COMPLETED,
                        ],
                    },
                },
                _sum: { totalAmount: true },
                _count: { id: true },
            });
        });

        it('should calculate summary metrics, top products, and group sales timeline correctly', async () => {
            mockPrismaService.order.aggregate.mockResolvedValue({
                _sum: { totalAmount: new Prisma.Decimal(300) },
                _count: { id: 2 },
            });

            mockPrismaService.orderItem.groupBy.mockResolvedValue([
                {
                    productId: 'prod-1',
                    productName: 'Keyboard',
                    _sum: {
                        quantity: 5,
                        price: new Prisma.Decimal(250),
                    },
                },
                {
                    productId: 'prod-2',
                    productName: 'Mouse',
                    _sum: {
                        quantity: 2,
                        price: new Prisma.Decimal(50),
                    },
                },
            ]);

            const date1 = new Date('2026-07-10T10:00:00.000Z');
            const date2 = new Date('2026-07-10T14:30:00.000Z');

            mockPrismaService.order.findMany.mockResolvedValue([
                {
                    createdAt: date1,
                    totalAmount: new Prisma.Decimal(100),
                },
                {
                    createdAt: date2,
                    totalAmount: new Prisma.Decimal(200),
                },
            ]);

            const result = await service.getDashboardData({
                from: '2026-07-01',
                to: '2026-07-31',
            });

            expect(result.summary).toEqual({
                totalRevenue: 300,
                totalOrders: 2,
                averageOrderValue: 150,
            });

            expect(result.topProducts).toEqual([
                {
                    productId: 'prod-1',
                    productName: 'Keyboard',
                    totalSold: 5,
                    totalRevenue: 250,
                },
                {
                    productId: 'prod-2',
                    productName: 'Mouse',
                    totalSold: 2,
                    totalRevenue: 50,
                },
            ]);

            expect(result.salesTimeline).toEqual([
                {
                    date: '2026-07-10',
                    revenue: 300,
                    orders: 2,
                },
            ]);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(prismaService.order.aggregate).toHaveBeenCalledWith({
                where: {
                    createdAt: {
                        gte: new Date('2026-07-01T00:00:00.000Z'),
                        lte: new Date('2026-07-31T23:59:59.999Z'),
                    },
                    status: {
                        in: [
                            OrderStatus.NEW,
                            OrderStatus.PROCESSING,
                            OrderStatus.SHIPPED,
                            OrderStatus.COMPLETED,
                        ],
                    },
                },
                _sum: { totalAmount: true },
                _count: { id: true },
            });
        });
    });

    describe('generateOrdersCsv', () => {
        it('should generate CSV content with correct headers and rows', async () => {
            const createdAtDate = new Date('2026-08-15T12:34:56.000Z');

            mockPrismaService.order.findMany.mockResolvedValue([
                {
                    id: 'order-123',
                    createdAt: createdAtDate,
                    status: OrderStatus.COMPLETED,
                    totalAmount: new Prisma.Decimal(129.99),
                    user: { email: 'john@example.com' },
                },
                {
                    id: 'order-456',
                    createdAt: createdAtDate,
                    status: OrderStatus.NEW,
                    totalAmount: new Prisma.Decimal(45.0),
                    user: null,
                },
            ]);

            const csvResult = await service.generateOrdersCsv({
                from: '2026-08-01',
            });

            const expectedHeader =
                'Order ID,Date,Customer,Status,Total Amount ($)\n';
            expect(csvResult.startsWith(expectedHeader)).toBe(true);

            expect(csvResult).toContain('"order-123"');
            expect(csvResult).toContain('"john@example.com"');
            expect(csvResult).toContain('"COMPLETED",129.99');

            expect(csvResult).toContain('"order-456"');
            expect(csvResult).toContain('"N/A"');
            expect(csvResult).toContain('"NEW",45.00');

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(prismaService.order.findMany).toHaveBeenCalledWith({
                where: {
                    createdAt: {
                        gte: new Date('2026-08-01T00:00:00.000Z'),
                    },
                },
                include: {
                    user: { select: { email: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        });

        it('should generate empty CSV table with headers when no orders are found', async () => {
            mockPrismaService.order.findMany.mockResolvedValue([]);

            const csvResult = await service.generateOrdersCsv({});

            expect(csvResult).toBe(
                'Order ID,Date,Customer,Status,Total Amount ($)\n',
            );
        });
    });
});
