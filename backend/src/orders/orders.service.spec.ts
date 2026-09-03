import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import {
    OrderStatus,
    Prisma,
    ProductStatus,
    ProductType,
    Role,
    SellerOrderStatus,
} from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MockPaymentService } from '../payments/mock-payment.service';
import { deriveOrderStatus, OrdersService } from './orders.service';
import {
    CartRepository,
    OrderRepository,
    OutboxRepository,
    ProductRepository,
    UnitOfWork,
} from '../database';
import { MetricsService } from '../metrics/metrics.service';

describe('OrdersService checkout', () => {
    let service: OrdersService;
    const transaction = jest.fn();
    const prisma = {
        payment: { findUnique: jest.fn() },
        sellerOrder: { findUnique: jest.fn(), findMany: jest.fn() },
        $transaction: transaction,
    };
    const queue = { add: jest.fn() };
    const redis = { delByPattern: jest.fn() };
    const logger = { log: jest.fn() };

    const firstProduct = {
        id: 'product-1',
        sellerId: 'seller-1',
        name: 'Keyboard',
        price: new Prisma.Decimal('100.00'),
        stock: 4,
        status: ProductStatus.ACTIVE,
        type: ProductType.FIXED_PRICE,
        isArchived: false,
    };
    const secondProduct = {
        id: 'product-2',
        sellerId: 'seller-2',
        name: 'Monitor',
        price: new Prisma.Decimal('200.00'),
        stock: 2,
        status: ProductStatus.ACTIVE,
        type: ProductType.FIXED_PRICE,
        isArchived: false,
    };
    const createdOrder = {
        id: 'order-1',
        userId: 'customer-1',
        status: OrderStatus.NEW,
        subtotal: new Prisma.Decimal('400'),
        totalAmount: new Prisma.Decimal('400'),
        sellerOrders: [],
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrdersService,
                { provide: PrismaService, useValue: prisma },
                { provide: getQueueToken('orders'), useValue: queue },
                { provide: RedisService, useValue: redis },
                { provide: LoggerService, useValue: logger },
                {
                    provide: MockPaymentService,
                    useValue: { authorize: jest.fn() },
                },
                CartRepository,
                OrderRepository,
                OutboxRepository,
                ProductRepository,
                UnitOfWork,
                {
                    provide: MetricsService,
                    useValue: {
                        recordCheckout: jest.fn(),
                        recordRefund: jest.fn(),
                        recordOrderCreated: jest.fn(),
                    },
                },
            ],
        }).compile();
        service = module.get(OrdersService);
        jest.clearAllMocks();
        prisma.payment.findUnique.mockResolvedValue(null);
    });

    describe('deriveOrderStatus', () => {
        it('returns NEW when a parent order has no seller orders', () => {
            expect(deriveOrderStatus([])).toBe(OrderStatus.NEW);
        });

        it('returns CANCELLED only when every seller order is cancelled', () => {
            expect(
                deriveOrderStatus([
                    SellerOrderStatus.CANCELLED,
                    SellerOrderStatus.CANCELLED,
                ]),
            ).toBe(OrderStatus.CANCELLED);
        });

        it('ignores cancelled seller orders when deriving the active parent status', () => {
            expect(
                deriveOrderStatus([
                    SellerOrderStatus.CANCELLED,
                    SellerOrderStatus.SHIPPED,
                    SellerOrderStatus.PROCESSING,
                ]),
            ).toBe(OrderStatus.SHIPPED);
        });

        it.each([
            [SellerOrderStatus.NEW, OrderStatus.NEW],
            [SellerOrderStatus.PAYMENT_PENDING, OrderStatus.PAYMENT_PENDING],
            [SellerOrderStatus.PROCESSING, OrderStatus.PROCESSING],
            [SellerOrderStatus.SHIPPED, OrderStatus.SHIPPED],
            [SellerOrderStatus.COMPLETED, OrderStatus.COMPLETED],
        ])('maps the highest active status: %s', (status, expected) => {
            expect(deriveOrderStatus([status])).toBe(expected);
        });
    });

    it('requires an idempotency key', async () => {
        await expect(service.checkout('customer-1', '')).rejects.toThrow(
            BadRequestException,
        );
        expect(transaction).not.toHaveBeenCalled();
    });

    it('returns an earlier checkout for the same idempotency key', async () => {
        prisma.payment.findUnique.mockResolvedValue({ order: createdOrder });
        await expect(
            service.checkout('customer-1', 'checkout-1'),
        ).resolves.toEqual(createdOrder);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('creates seller sub-orders, immutable item snapshots, ledger entries, and outbox events atomically', async () => {
        const tx = {
            payment: { findUnique: jest.fn().mockResolvedValue(null) },
            cart: { findUnique: jest.fn().mockResolvedValue({ id: 'cart-1' }) },
            cartItem: {
                findMany: jest.fn().mockResolvedValue([
                    { product: firstProduct, quantity: 2 },
                    { product: secondProduct, quantity: 1 },
                ]),
                deleteMany: jest.fn(),
            },
            product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
            order: { create: jest.fn().mockResolvedValue(createdOrder) },
            outboxEvent: { create: jest.fn(), createMany: jest.fn() },
        };
        transaction.mockImplementation(
            (callback: (client: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.checkout('customer-1', 'checkout-1'),
        ).resolves.toEqual(createdOrder);

        expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
        expect(tx.order.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: 'customer-1',
                    subtotal: new Prisma.Decimal('400'),
                    sellerOrders: expect.objectContaining({
                        create: expect.arrayContaining([
                            expect.objectContaining({
                                sellerId: 'seller-1',
                                subtotal: new Prisma.Decimal('200'),
                                commissionRate: new Prisma.Decimal('0.10'),
                                commissionAmount: new Prisma.Decimal('20'),
                                sellerEarnings: new Prisma.Decimal('180'),
                                items: expect.any(Object),
                                ledgerEntries: expect.any(Object),
                            }),
                            expect.objectContaining({
                                sellerId: 'seller-2',
                                subtotal: new Prisma.Decimal('200'),
                                commissionRate: new Prisma.Decimal('0.10'),
                                commissionAmount: new Prisma.Decimal('20'),
                                sellerEarnings: new Prisma.Decimal('180'),
                                items: expect.any(Object),
                                ledgerEntries: expect.any(Object),
                            }),
                        ]),
                    }),
                    payments: expect.objectContaining({
                        create: expect.objectContaining({
                            idempotencyKey: 'checkout-1',
                        }),
                    }),
                }),
            }),
        );
        expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
            where: { cartId: 'cart-1' },
        });
        expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
        expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
    });

    it('rejects an empty cart inside the checkout transaction', async () => {
        const tx = {
            payment: { findUnique: jest.fn().mockResolvedValue(null) },
            cart: { findUnique: jest.fn().mockResolvedValue(null) },
        };
        transaction.mockImplementation(
            (callback: (client: typeof tx) => unknown) => callback(tx),
        );
        await expect(
            service.checkout('customer-1', 'checkout-1'),
        ).rejects.toThrow('Cart is empty');
    });

    it('does not allow a seller to read an unrelated order', async () => {
        const findUnique = jest.fn().mockResolvedValue({
            ...createdOrder,
            sellerOrders: [{ sellerId: 'seller-2', items: [] }],
        });
        (prisma as Record<string, unknown>).order = { findUnique };
        await expect(
            service.findOne('seller-1', Role.SELLER, 'order-1'),
        ).rejects.toThrow('access');
    });

    it.each([
        [[SellerOrderStatus.NEW], OrderStatus.NEW],
        [
            [SellerOrderStatus.PROCESSING, SellerOrderStatus.PROCESSING],
            OrderStatus.PROCESSING,
        ],
        [
            [SellerOrderStatus.SHIPPED, SellerOrderStatus.PROCESSING],
            OrderStatus.SHIPPED,
        ],
        [
            [SellerOrderStatus.COMPLETED, SellerOrderStatus.SHIPPED],
            OrderStatus.COMPLETED,
        ],
        [
            [SellerOrderStatus.CANCELLED, SellerOrderStatus.PROCESSING],
            OrderStatus.PROCESSING,
        ],
        [[SellerOrderStatus.CANCELLED], OrderStatus.CANCELLED],
    ])(
        'derives parent status from seller-order statuses',
        (statuses, expected) => {
            expect(deriveOrderStatus(statuses)).toBe(expected);
        },
    );

    it('updates an owned seller order, derives parent status, and records outbox events', async () => {
        const tx = {
            sellerOrder: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'seller-order-1',
                    sellerId: 'seller-1',
                    orderId: 'order-1',
                    status: SellerOrderStatus.PROCESSING,
                    order: { id: 'order-1', status: OrderStatus.PROCESSING },
                }),
                update: jest.fn().mockResolvedValue({
                    id: 'seller-order-1',
                    sellerId: 'seller-1',
                    status: SellerOrderStatus.SHIPPED,
                    items: [],
                    order: {},
                    seller: {},
                }),
                findMany: jest
                    .fn()
                    .mockResolvedValue([
                        { status: SellerOrderStatus.SHIPPED },
                        { status: SellerOrderStatus.PROCESSING },
                    ]),
            },
            order: {
                update: jest.fn().mockResolvedValue({
                    id: 'order-1',
                    status: OrderStatus.PARTIALLY_SHIPPED,
                }),
            },
            outboxEvent: { createMany: jest.fn() },
        };
        transaction.mockImplementation(
            (callback: (client: typeof tx) => unknown) => callback(tx),
        );

        const result = await service.updateSellerOrderStatus(
            'seller-1',
            'seller-order-1',
            {
                status: SellerOrderStatus.SHIPPED,
                trackingNumber: 'UA123',
            },
        );

        expect(result.order.status).toBe(OrderStatus.PARTIALLY_SHIPPED);
        expect(tx.sellerOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: SellerOrderStatus.SHIPPED,
                    trackingNumber: 'UA123',
                }),
            }),
        );
        expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
    });

    it('rejects an illegal seller-order transition before writing changes', async () => {
        const tx = {
            sellerOrder: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'seller-order-1',
                    sellerId: 'seller-1',
                    orderId: 'order-1',
                    status: SellerOrderStatus.NEW,
                    order: { id: 'order-1', status: OrderStatus.NEW },
                }),
            },
        };
        transaction.mockImplementation(
            (callback: (client: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.updateSellerOrderStatus('seller-1', 'seller-order-1', {
                status: SellerOrderStatus.COMPLETED,
            }),
        ).rejects.toThrow('Cannot change seller order');
    });

    it('rejects a second concurrent refund that would exceed item quantity', async () => {
        const orderItem = {
            id: 'item-1',
            productId: 'product-1',
            quantity: 2,
            unitPrice: new Prisma.Decimal('50'),
            sellerOrderId: 'seller-order-1',
            sellerOrder: {
                id: 'seller-order-1',
                status: SellerOrderStatus.PROCESSING,
                commissionRate: new Prisma.Decimal('0.10'),
                orderId: 'order-1',
                order: {
                    userId: 'customer-1',
                    payments: [
                        {
                            id: 'payment-1',
                            status: 'PAID',
                            amount: new Prisma.Decimal('100'),
                        },
                    ],
                },
            },
        };
        const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ id: 'seller-order-1' }]),
            orderItem: { findUnique: jest.fn().mockResolvedValue(orderItem) },
            sellerOrder: {
                update: jest.fn().mockResolvedValue({
                    id: 'seller-order-1',
                    items: [],
                    seller: {},
                    order: {},
                }),
            },
            refund: {
                findUnique: jest.fn().mockResolvedValue(null),
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _sum: { quantity: 2, amount: null } }),
                create: jest.fn(),
            },
            payment: { update: jest.fn() },
            ledgerEntry: { create: jest.fn() },
            outboxEvent: { create: jest.fn() },
            product: { update: jest.fn() },
        };
        prisma.refund = { findUnique: jest.fn().mockResolvedValue(null) };
        transaction.mockImplementation(
            (callback: (client: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.refundOrderItem(
                'customer-1',
                'item-1',
                1,
                'race',
                'refund-race-2',
            ),
        ).rejects.toThrow('Refund quantity exceeds the refundable quantity');
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.refund.create).not.toHaveBeenCalled();
    });

    it('returns the existing refund for a repeated idempotency key', async () => {
        const existing = {
            id: 'refund-1',
            orderItemId: 'item-1',
            quantity: 1,
        };
        prisma.refund = { findUnique: jest.fn().mockResolvedValue(existing) };

        await expect(
            service.refundOrderItem(
                'customer-1',
                'item-1',
                1,
                'again',
                'refund-idempotent',
            ),
        ).resolves.toEqual(existing);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('cancels only the targeted seller order and leaves sibling orders active', async () => {
        const siblingStatuses = [
            { status: SellerOrderStatus.CANCELLED },
            { status: SellerOrderStatus.PROCESSING },
        ];
        const tx = {
            outboxEvent: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn(),
                createMany: jest.fn(),
            },
            sellerOrder: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'seller-order-1',
                    sellerId: 'seller-1',
                    orderId: 'order-1',
                    status: SellerOrderStatus.PROCESSING,
                    commissionRate: new Prisma.Decimal('0.10'),
                    items: [
                        {
                            id: 'item-1',
                            productId: 'product-1',
                            quantity: 1,
                            unitPrice: new Prisma.Decimal('100'),
                        },
                    ],
                    order: {
                        userId: 'customer-1',
                        payments: [
                            {
                                id: 'payment-1',
                                status: 'PAID',
                                amount: new Prisma.Decimal('300'),
                            },
                        ],
                    },
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                update: jest.fn().mockResolvedValue({
                    id: 'seller-order-1',
                    sellerId: 'seller-1',
                    status: SellerOrderStatus.CANCELLED,
                    items: [],
                    order: {},
                    seller: {},
                }),
                findMany: jest.fn().mockResolvedValue(siblingStatuses),
            },
            refund: {
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _sum: { quantity: 0, amount: null } }),
                create: jest.fn(),
            },
            payment: { update: jest.fn() },
            product: { update: jest.fn() },
            ledgerEntry: { createMany: jest.fn(), create: jest.fn() },
            order: {
                update: jest.fn().mockResolvedValue({
                    id: 'order-1',
                    status: OrderStatus.PROCESSING,
                }),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'order-1',
                    sellerOrders: [
                        {
                            id: 'seller-order-1',
                            status: SellerOrderStatus.CANCELLED,
                        },
                        {
                            id: 'seller-order-2',
                            status: SellerOrderStatus.PROCESSING,
                        },
                    ],
                    payments: [],
                }),
            },
        };
        prisma.outboxEvent = {
            findUnique: jest.fn().mockResolvedValue({ id: 'event-cancel-1' }),
        };
        transaction.mockImplementation(
            (callback: (client: typeof tx) => unknown) => callback(tx),
        );

        const result = await service.cancelSellerOrder(
            'seller-1',
            'seller-order-1',
            'cancel-sibling-1',
        );

        expect(result.status).toBe(SellerOrderStatus.CANCELLED);
        expect(tx.sellerOrder.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: 'seller-order-1' }),
            }),
        );
        expect(tx.order.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { status: OrderStatus.PROCESSING },
            }),
        );
        expect(tx.sellerOrder.findMany).toHaveBeenCalledWith({
            where: { orderId: 'order-1' },
            select: { status: true },
        });
        expect(tx.product.update).toHaveBeenCalled();
    });
});
