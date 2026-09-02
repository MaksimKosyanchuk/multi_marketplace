import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import {
    OrderStatus,
    Prisma,
    ProductStatus,
    ProductType,
    Role,
} from '@prisma/client';
import { LoggerService } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OrdersService } from './orders.service';

describe('OrdersService checkout', () => {
    let service: OrdersService;
    const transaction = jest.fn();
    const prisma = {
        payment: { findUnique: jest.fn() },
        $transaction: transaction,
    };
    const queue = { add: jest.fn() };
    const redis = { delByPattern: jest.fn() };
    const logger = { log: jest.fn() };

    const firstProduct = {
        id: 'product-1', sellerId: 'seller-1', name: 'Keyboard',
        price: new Prisma.Decimal('100.00'), stock: 4,
        status: ProductStatus.ACTIVE, type: ProductType.FIXED_PRICE,
        isArchived: false,
    };
    const secondProduct = {
        id: 'product-2', sellerId: 'seller-2', name: 'Monitor',
        price: new Prisma.Decimal('200.00'), stock: 2,
        status: ProductStatus.ACTIVE, type: ProductType.FIXED_PRICE,
        isArchived: false,
    };
    const createdOrder = {
        id: 'order-1', userId: 'customer-1', status: OrderStatus.NEW,
        subtotal: new Prisma.Decimal('400'), totalAmount: new Prisma.Decimal('400'),
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
            ],
        }).compile();
        service = module.get(OrdersService);
        jest.clearAllMocks();
        prisma.payment.findUnique.mockResolvedValue(null);
    });

    it('requires an idempotency key', async () => {
        await expect(service.checkout('customer-1', '')).rejects.toThrow(BadRequestException);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('returns an earlier checkout for the same idempotency key', async () => {
        prisma.payment.findUnique.mockResolvedValue({ order: createdOrder });
        await expect(service.checkout('customer-1', 'checkout-1')).resolves.toEqual(createdOrder);
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
            outboxEvent: { createMany: jest.fn() },
        };
        transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));

        await expect(service.checkout('customer-1', 'checkout-1')).resolves.toEqual(createdOrder);

        expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
        expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                userId: 'customer-1',
                subtotal: new Prisma.Decimal('400'),
                sellerOrders: expect.objectContaining({ create: expect.arrayContaining([
                    expect.objectContaining({ sellerId: 'seller-1', items: expect.any(Object), ledgerEntries: expect.any(Object) }),
                    expect.objectContaining({ sellerId: 'seller-2', items: expect.any(Object), ledgerEntries: expect.any(Object) }),
                ]) }),
                payments: expect.objectContaining({ create: expect.objectContaining({ idempotencyKey: 'checkout-1' }) }),
            }),
        }));
        expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
        expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
        expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
    });

    it('rejects an empty cart inside the checkout transaction', async () => {
        const tx = {
            payment: { findUnique: jest.fn().mockResolvedValue(null) },
            cart: { findUnique: jest.fn().mockResolvedValue(null) },
        };
        transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
        await expect(service.checkout('customer-1', 'checkout-1')).rejects.toThrow('Cart is empty');
    });

    it('does not allow a seller to read an unrelated order', async () => {
        const findUnique = jest.fn().mockResolvedValue({
            ...createdOrder,
            sellerOrders: [{ sellerId: 'seller-2', items: [] }],
        });
        (prisma as Record<string, unknown>).order = { findUnique };
        await expect(service.findOne('seller-1', Role.SELLER, 'order-1')).rejects.toThrow('access');
    });
});
