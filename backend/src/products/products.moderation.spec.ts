import { BadRequestException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { ProductsService } from './products.service';
import {
    AuctionRepository,
    CartRepository,
    OutboxRepository,
    ProductRepository,
} from '../database';

describe('ProductsService moderation', () => {
    const product = {
        id: 'product-1',
        sellerId: 'seller-1',
        status: ProductStatus.PENDING_APPROVAL,
        isArchived: false,
    };
    const tx = {
        product: {
            updateMany: jest.fn(),
            update: jest.fn(),
            findUniqueOrThrow: jest.fn(),
        },
        outboxEvent: { create: jest.fn() },
    };
    const prisma = {
        product: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        $transaction: jest.fn(),
    };
    const redis = { delByPattern: jest.fn() };
    const logger = { log: jest.fn() };

    let service: ProductsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ProductsService(
            prisma as never,
            redis as never,
            logger as never,
            new ProductRepository(prisma as never),
            new AuctionRepository(prisma as never),
            new CartRepository(prisma as never),
            new OutboxRepository(prisma as never),
        );
        prisma.$transaction.mockImplementation((operation: unknown) =>
            typeof operation === 'function'
                ? operation(tx)
                : Promise.resolve([]),
        );
        tx.product.updateMany.mockResolvedValue({ count: 1 });
        tx.product.findUniqueOrThrow.mockResolvedValue(product);
    });

    it('approves only a pending product and records an outbox event', async () => {
        prisma.product.findUnique.mockResolvedValue(product);

        const result = await service.approve(
            'product-1',
            'admin-1',
            'Approved',
        );

        expect(tx.product.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'product-1',
                status: ProductStatus.PENDING_APPROVAL,
                isArchived: false,
            },
            data: {
                status: ProductStatus.ACTIVE,
                version: { increment: 1 },
            },
        });
        expect(tx.outboxEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: 'product.approved',
                    payload: expect.objectContaining({
                        productId: 'product-1',
                        adminId: 'admin-1',
                        comment: 'Approved',
                    }),
                }),
            }),
        );
        expect(result).toEqual(product);
        expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
    });

    it('rejects moderation for a product that is not pending', async () => {
        prisma.product.findUnique.mockResolvedValue({
            ...product,
            status: ProductStatus.ACTIVE,
        });

        await expect(service.reject('product-1', 'admin-1')).rejects.toThrow(
            BadRequestException,
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a pending product and records the rejection event', async () => {
        prisma.product.findUnique.mockResolvedValue(product);

        await service.reject('product-1', 'admin-1', 'Incomplete description');

        expect(tx.product.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    status: ProductStatus.REJECTED,
                    version: { increment: 1 },
                },
            }),
        );
        expect(tx.outboxEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ type: 'product.rejected' }),
            }),
        );
        expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
    });

    it('restores an archived product as a draft', async () => {
        prisma.product.findUnique.mockResolvedValue({
            ...product,
            isArchived: true,
        });
        tx.product.update.mockResolvedValue({
            ...product,
            isArchived: false,
            status: ProductStatus.DRAFT,
        });

        await service.restore('product-1', 'seller-1');

        expect(tx.product.updateMany).toHaveBeenCalledWith({
            where: { id: 'product-1', sellerId: 'seller-1', isArchived: true },
            data: {
                isArchived: false,
                status: ProductStatus.DRAFT,
                version: { increment: 1 },
            },
        });
    });
});
