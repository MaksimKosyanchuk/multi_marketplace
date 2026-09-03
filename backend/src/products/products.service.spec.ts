import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ProductSort } from './dto/query-product.dto';
import { ProductsService } from './products.service';
import { LoggerService } from '../logger/logger.service';
import { ProductStatus, ProductType } from '@prisma/client';
import * as fileUtils from '../common/utils/file';
import {
    AuctionRepository,
    CartRepository,
    OutboxRepository,
    ProductRepository,
} from '../database';

jest.mock('../common/utils/file', () => ({
    deleteFile: jest.fn().mockResolvedValue(undefined),
}));

describe('ProductsService', () => {
    let service: ProductsService;

    let prisma: {
        product: {
            findMany: jest.Mock;
            findUnique: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
            count: jest.Mock;
        };
        category: {
            findUnique: jest.Mock;
        };
        cartItem: {
            deleteMany: jest.Mock;
        };
        outboxEvent: {
            create: jest.Mock;
        };
        $transaction: jest.Mock;
    };

    let redis: {
        get: jest.Mock;
        set: jest.Mock;
        delByPattern: jest.Mock;
    };

    const mockCategory = {
        id: 'cat-1',
        name: 'Electronics',
    };

    const mockProduct = {
        id: 'prod-1',
        sellerId: 'seller-1',
        name: 'Smartphone',
        description: 'Latest model',
        price: 999,
        stock: 10,
        categoryId: 'cat-1',
        status: ProductStatus.ACTIVE,
        type: ProductType.FIXED_PRICE,
        imageUrl: '/uploads/phone.jpg',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: mockCategory,
        rating: 0, // Убедитесь, что здесь нет поля reviews
    };

    const mockPrismaService = {
        product: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        category: {
            findUnique: jest.fn(),
        },
        cartItem: {
            deleteMany: jest.fn(),
        },
        outboxEvent: {
            create: jest.fn(),
        },
        $transaction: jest.fn(),
    };

    const mockTransactionPrisma = {
        product: {
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            findUnique: jest.fn(),
            findUniqueOrThrow: jest.fn(),
        },
        outboxEvent: {
            create: jest.fn(),
        },
        auction: {
            updateMany: jest.fn(),
        },
        cartItem: {
            deleteMany: jest.fn(),
        },
    };

    const mockRedisService = {
        get: jest.fn(),
        set: jest.fn(),
        delByPattern: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductsService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: RedisService,
                    useValue: mockRedisService,
                },
                {
                    provide: LoggerService,
                    useValue: {
                        log: jest.fn(),
                        error: jest.fn(),
                        warn: jest.fn(),
                        debug: jest.fn(),
                        verbose: jest.fn(),
                    },
                },
                ProductRepository,
                AuctionRepository,
                CartRepository,
                OutboxRepository,
            ],
        }).compile();

        service = module.get<ProductsService>(ProductsService);
        prisma = module.get(PrismaService);
        redis = module.get(RedisService);

        jest.resetAllMocks();

        mockPrismaService.$transaction.mockImplementation(
            async <T>(
                transaction:
                    | ((tx: typeof mockTransactionPrisma) => Promise<T>)
                    | Promise<T>[],
            ): Promise<T> => {
                if (typeof transaction === 'function') {
                    return transaction(mockTransactionPrisma);
                }

                return Promise.all(transaction) as unknown as T;
            },
        );
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('findAll', () => {
        const query = {
            page: 1,
            limit: 10,
            sort: ProductSort.PRICE_ASC,
            search: 'phone',
            includeArchived: false,
        };

        it('should return cached result if available in Redis', async () => {
            const cachedResult = {
                items: [
                    {
                        ...mockProduct,
                        createdAt: mockProduct.createdAt.toISOString(),
                        updatedAt: mockProduct.updatedAt.toISOString(),
                    },
                ],
                meta: {
                    total: 1,
                    page: 1,
                    limit: 10,
                    pageCount: 1,
                },
            };

            redis.get.mockResolvedValue(JSON.stringify(cachedResult));

            const result = await service.findAll(query);

            expect(redis.get).toHaveBeenCalledWith(
                `products:list:${JSON.stringify(query)}`,
            );

            expect(prisma.$transaction).not.toHaveBeenCalled();

            expect(result).toEqual(cachedResult);
        });

        it('should fetch from database and set cache if Redis cache misses', async () => {
            redis.get.mockResolvedValue(null);

            prisma.product.findMany.mockResolvedValue([
                { ...mockProduct, reviews: [] },
            ]);
            prisma.product.count.mockResolvedValue(1);

            prisma.$transaction.mockResolvedValue([
                [{ ...mockProduct, reviews: [] }],
                1,
            ]);

            const result = await service.findAll(query);

            expect(prisma.$transaction).toHaveBeenCalled();

            expect(redis.set).toHaveBeenCalledWith(
                `products:list:${JSON.stringify(query)}`,
                JSON.stringify(result),
                60,
            );

            expect(result).toEqual({
                items: [mockProduct],
                meta: {
                    total: 1,
                    page: 1,
                    limit: 10,
                    pageCount: 1,
                },
            });
        });
    });

    describe('findOne', () => {
        it('should return a product by id', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            const result = await service.findOne('prod-1');

            expect(prisma.product.findUnique).toHaveBeenCalledWith({
                where: { id: 'prod-1' },
                include: {
                    category: true,
                    reviews: {
                        select: {
                            rating: true,
                        },
                    },
                },
            });

            expect(result).toEqual(mockProduct);
        });

        it('should return cached product if available in Redis', async () => {
            const cachedProduct = {
                ...mockProduct,
                createdAt: mockProduct.createdAt.toISOString(),
                updatedAt: mockProduct.updatedAt.toISOString(),
                rating: 4.5,
            };

            redis.get.mockResolvedValue(JSON.stringify(cachedProduct));

            const result = await service.findOne('prod-1');

            expect(redis.get).toHaveBeenCalledWith('products:detail:prod-1');

            expect(prisma.product.findUnique).not.toHaveBeenCalled();

            expect(result).toEqual(cachedProduct);
        });

        it('should calculate rating from reviews', async () => {
            const productWithReviews = {
                ...mockProduct,
                reviews: [{ rating: 5 }, { rating: 4 }, { rating: 3 }],
            };

            prisma.product.findUnique.mockResolvedValue(productWithReviews);

            const result = await service.findOne('prod-1');

            expect(result).toEqual({
                ...productWithReviews,
                rating: 4,
            });

            expect(redis.set).toHaveBeenCalledWith(
                'products:detail:prod-1',
                JSON.stringify({
                    ...productWithReviews,
                    rating: 4,
                }),
                60,
            );
        });

        it('should calculate zero rating when product has no reviews', async () => {
            const productWithoutReviews = {
                ...mockProduct,
                reviews: [],
            };

            prisma.product.findUnique.mockResolvedValue(productWithoutReviews);

            const result = await service.findOne('prod-1');

            expect(result).toEqual({
                ...productWithoutReviews,
                rating: 0,
            });
        });

        it('should throw NotFoundException if product is not found', async () => {
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(service.findOne('invalid-id')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('create', () => {
        const dto = {
            name: 'Smartphone',
            price: 999,
            stock: 10,
            categoryId: 'cat-1',
            description: 'Latest model',
        };

        it('should create product successfully and invalidate cache', async () => {
            prisma.category.findUnique.mockResolvedValue(mockCategory);

            mockTransactionPrisma.product.create.mockResolvedValue(mockProduct);

            mockTransactionPrisma.outboxEvent.create.mockResolvedValue({});

            const result = await service.create(
                dto,
                'seller-1',
                '/uploads/phone.jpg',
            );

            expect(prisma.category.findUnique).toHaveBeenCalledWith({
                where: {
                    id: 'cat-1',
                },
            });

            const productCreateCall = mockTransactionPrisma.product.create.mock
                .calls[0] as unknown[];
            const productCreateArg = productCreateCall[0] as { data: unknown };
            expect(productCreateArg).toEqual({
                data: expect.objectContaining({
                    name: 'Smartphone',
                    price: 999,
                    stock: 10,
                    categoryId: 'cat-1',
                    description: 'Latest model',
                    imageUrl: '/uploads/phone.jpg',
                    sellerId: 'seller-1',
                    slug: expect.stringMatching(/^smartphone-/),
                }),
            });

            const outboxCreateCall = mockTransactionPrisma.outboxEvent.create
                .mock.calls[0] as unknown[];
            const outboxCreateArg = outboxCreateCall[0] as { data: unknown };
            expect(outboxCreateArg).toEqual({
                data: expect.objectContaining({
                    aggregateType: 'Product',
                    aggregateId: 'prod-1',
                    type: 'product.created',
                    payload: expect.objectContaining({
                        productId: 'prod-1',
                    }),
                }),
            });

            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'search:products:*',
            );

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'products:detail:prod-1',
            );

            expect(result).toEqual(mockProduct);
        });

        it('should throw BadRequestException if category does not exist and cleanup uploaded file', async () => {
            prisma.category.findUnique.mockResolvedValue(null);

            await expect(
                service.create(dto, 'seller-1', '/uploads/temp.jpg'),
            ).rejects.toThrow(BadRequestException);

            expect(fileUtils.deleteFile).toHaveBeenCalledWith(
                '/uploads/temp.jpg',
            );

            expect(mockTransactionPrisma.product.create).not.toHaveBeenCalled();
        });

        it('should delete uploaded file if transaction fails', async () => {
            prisma.category.findUnique.mockResolvedValue(mockCategory);

            mockTransactionPrisma.product.create.mockRejectedValue(
                new Error('DB Error'),
            );

            await expect(
                service.create(dto, 'seller-1', '/uploads/temp.jpg'),
            ).rejects.toThrow('DB Error');

            expect(fileUtils.deleteFile).toHaveBeenCalledWith(
                '/uploads/temp.jpg',
            );
        });
    });

    describe('update', () => {
        const dto = {
            name: 'Updated Smartphone',
            imageUrl: '/uploads/new-phone.jpg',
        };

        it('should update product, delete old image, and invalidate cache', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            mockTransactionPrisma.product.update.mockResolvedValue({
                ...mockProduct,
                ...dto,
            });

            mockTransactionPrisma.outboxEvent.create.mockResolvedValue({});

            const result = await service.update('prod-1', dto, 'seller-1');

            const productUpdateCall = mockTransactionPrisma.product.update.mock
                .calls[0] as unknown[];
            const productUpdateArg = productUpdateCall[0] as { data: unknown };
            expect(productUpdateArg).toEqual({
                where: {
                    id: 'prod-1',
                },
                data: expect.objectContaining({
                    name: 'Updated Smartphone',
                    imageUrl: '/uploads/new-phone.jpg',
                }),
            });

            const outboxUpdateCall = mockTransactionPrisma.outboxEvent.create
                .mock.calls[0] as unknown[];
            const outboxUpdateArg = outboxUpdateCall[0] as { data: unknown };
            expect(outboxUpdateArg).toEqual({
                data: expect.objectContaining({
                    aggregateType: 'Product',
                    aggregateId: 'prod-1',
                    type: 'product.updated',
                }),
            });

            expect(fileUtils.deleteFile).toHaveBeenCalledWith(
                '/uploads/phone.jpg',
            );

            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'search:products:*',
            );

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'products:detail:prod-1',
            );

            expect(result.name).toBe('Updated Smartphone');
        });

        it('should delete newly uploaded file if update fails', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            mockTransactionPrisma.product.update.mockRejectedValue(
                new Error('DB Error'),
            );

            await expect(
                service.update('prod-1', dto, 'seller-1', '/uploads/temp.jpg'),
            ).rejects.toThrow('DB Error');

            expect(fileUtils.deleteFile).toHaveBeenCalledWith(
                '/uploads/temp.jpg',
            );
        });

        it('should throw NotFoundException if product does not exist', async () => {
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(
                service.update('prod-1', dto, 'seller-1'),
            ).rejects.toThrow(NotFoundException);

            expect(mockTransactionPrisma.product.update).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenException if product belongs to another seller', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                sellerId: 'another-seller',
            });

            await expect(
                service.update('prod-1', dto, 'seller-1'),
            ).rejects.toThrow(ForbiddenException);

            expect(mockTransactionPrisma.product.update).not.toHaveBeenCalled();
        });

        it('should not allow editing a published auction', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                type: ProductType.AUCTION,
                status: ProductStatus.ACTIVE,
            });

            await expect(
                service.update('prod-1', dto, 'seller-1'),
            ).rejects.toThrow(BadRequestException);

            expect(mockTransactionPrisma.product.update).not.toHaveBeenCalled();
        });
    });

    describe('remove', () => {
        it('should archive product, delete cart items, and invalidate caches', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            mockTransactionPrisma.product.updateMany.mockResolvedValue({
                count: 1,
            });

            mockTransactionPrisma.product.findUniqueOrThrow.mockResolvedValue({
                ...mockProduct,
                isArchived: true,
                status: ProductStatus.ARCHIVED,
                version: 1,
            });

            mockTransactionPrisma.cartItem.deleteMany.mockResolvedValue({});

            mockTransactionPrisma.outboxEvent.create.mockResolvedValue({});

            const result = await service.remove('prod-1', 'seller-1');

            const updateManyCall = mockTransactionPrisma.product.updateMany.mock
                .calls[0] as unknown[];
            const updateManyArg = updateManyCall[0] as {
                where: unknown;
                data: unknown;
            };
            expect(updateManyArg).toEqual({
                where: {
                    id: 'prod-1',
                    sellerId: 'seller-1',
                    isArchived: false,
                },
                data: {
                    isArchived: true,
                    status: ProductStatus.ARCHIVED,
                    version: {
                        increment: 1,
                    },
                },
            });

            const deleteManyCall = mockTransactionPrisma.cartItem.deleteMany
                .mock.calls[0] as unknown[];
            const deleteManyArg = deleteManyCall[0] as { where: unknown };
            expect(deleteManyArg).toEqual({
                where: {
                    productId: 'prod-1',
                },
            });

            const outboxRemoveCall = mockTransactionPrisma.outboxEvent.create
                .mock.calls[0] as unknown[];
            const outboxRemoveArg = outboxRemoveCall[0] as { data: unknown };
            expect(outboxRemoveArg).toEqual({
                data: expect.objectContaining({
                    aggregateType: 'Product',
                    aggregateId: 'prod-1',
                    type: 'product.archived',
                }),
            });

            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'search:products:*',
            );

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'products:detail:prod-1',
            );

            expect(redis.delByPattern).toHaveBeenCalledWith('cart:*');

            expect(result).toEqual({
                success: true,
            });
        });

        it('should throw BadRequestException if product is already archived', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                isArchived: true,
            });

            mockTransactionPrisma.product.updateMany.mockResolvedValue({
                count: 0,
            });

            await expect(service.remove('prod-1', 'seller-1')).rejects.toThrow(
                BadRequestException,
            );

            expect(mockTransactionPrisma.product.updateMany).toHaveBeenCalled();

            expect(
                mockTransactionPrisma.cartItem.deleteMany,
            ).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException if product does not exist', async () => {
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(service.remove('prod-1', 'seller-1')).rejects.toThrow(
                NotFoundException,
            );

            expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenException if product belongs to another seller', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                sellerId: 'another-seller',
            });

            await expect(service.remove('prod-1', 'seller-1')).rejects.toThrow(
                ForbiddenException,
            );

            expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('restore', () => {
        it('should restore archived product and invalidate cache', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                isArchived: true,
                status: ProductStatus.ARCHIVED,
            });

            mockTransactionPrisma.product.updateMany.mockResolvedValue({
                count: 1,
            });

            mockTransactionPrisma.product.findUniqueOrThrow.mockResolvedValue({
                ...mockProduct,
                isArchived: false,
                status: ProductStatus.DRAFT,
                version: 1,
            });

            mockTransactionPrisma.outboxEvent.create.mockResolvedValue({});

            const result = await service.restore('prod-1', 'seller-1');

            const restoreUpdateCall = mockTransactionPrisma.product.updateMany
                .mock.calls[0] as unknown[];
            const restoreUpdateArg = restoreUpdateCall[0] as {
                where: unknown;
                data: unknown;
            };
            expect(restoreUpdateArg).toEqual({
                where: {
                    id: 'prod-1',
                    sellerId: 'seller-1',
                    isArchived: true,
                },
                data: {
                    isArchived: false,
                    status: ProductStatus.DRAFT,
                    version: {
                        increment: 1,
                    },
                },
            });

            const findOrThrowCall = mockTransactionPrisma.product
                .findUniqueOrThrow.mock.calls[0] as unknown[];
            const findOrThrowArg = findOrThrowCall[0] as { where: unknown };
            expect(findOrThrowArg).toEqual({
                where: {
                    id: 'prod-1',
                },
            });

            const outboxRestoreCall = mockTransactionPrisma.outboxEvent.create
                .mock.calls[0] as unknown[];
            const outboxRestoreArg = outboxRestoreCall[0] as { data: unknown };
            expect(outboxRestoreArg).toEqual({
                data: expect.objectContaining({
                    aggregateType: 'Product',
                    aggregateId: 'prod-1',
                    type: 'product.restored',
                    payload: expect.objectContaining({
                        productId: 'prod-1',
                        status: ProductStatus.DRAFT,
                    }),
                }),
            });

            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'search:products:*',
            );

            expect(redis.delByPattern).toHaveBeenCalledWith(
                'products:detail:prod-1',
            );

            expect(result).toEqual(
                expect.objectContaining({
                    id: 'prod-1',
                    isArchived: false,
                    status: ProductStatus.DRAFT,
                }),
            );
        });

        it('should throw BadRequestException if product is not archived', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            mockTransactionPrisma.product.updateMany.mockResolvedValue({
                count: 0,
            });

            await expect(service.restore('prod-1', 'seller-1')).rejects.toThrow(
                BadRequestException,
            );

            expect(mockTransactionPrisma.product.updateMany).toHaveBeenCalled();
        });

        it('should throw NotFoundException if product does not exist', async () => {
            prisma.product.findUnique.mockResolvedValue(null);

            await expect(service.restore('prod-1', 'seller-1')).rejects.toThrow(
                NotFoundException,
            );

            expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenException if product belongs to another seller', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                sellerId: 'another-seller',
            });

            await expect(service.restore('prod-1', 'seller-1')).rejects.toThrow(
                ForbiddenException,
            );

            expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('findSellerProducts', () => {
        const query = {
            page: 1,
            limit: 10,
            sort: ProductSort.PRICE_ASC,
            search: 'phone',
            includeArchived: false,
            categoryId: 'cat-1',
            type: ProductType.FIXED_PRICE,
        };

        it('should return seller products', async () => {
            prisma.product.findMany.mockResolvedValue([
                { ...mockProduct, reviews: [] },
            ]);

            prisma.product.count.mockResolvedValue(1);

            prisma.$transaction.mockResolvedValue([
                [{ ...mockProduct, reviews: [] }],
                1,
            ]);

            const result = await service.findSellerProducts('seller-1', query);

            expect(prisma.$transaction).toHaveBeenCalled();

            expect(result).toEqual({
                items: [mockProduct],
                meta: {
                    total: 1,
                    page: 1,
                    limit: 10,
                    pageCount: 1,
                },
            });
        });
    });

    describe('submitForApproval', () => {
        it('should submit draft product for approval and create outbox event', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                status: ProductStatus.DRAFT,
            });

            mockTransactionPrisma.product.updateMany.mockResolvedValue({
                count: 1,
            });

            const submittedProduct = {
                ...mockProduct,
                status: ProductStatus.PENDING_APPROVAL,
                version: 1,
            };

            mockTransactionPrisma.product.findUniqueOrThrow.mockResolvedValue(
                submittedProduct,
            );

            mockTransactionPrisma.outboxEvent.create.mockResolvedValue({});

            const result = await service.submitForApproval(
                'prod-1',
                'seller-1',
            );

            const submitUpdateCall = mockTransactionPrisma.product.updateMany
                .mock.calls[0] as unknown[];
            const submitUpdateArg = submitUpdateCall[0] as {
                where: unknown;
                data: unknown;
            };
            expect(submitUpdateArg).toEqual({
                where: {
                    id: 'prod-1',
                    sellerId: 'seller-1',
                    status: ProductStatus.DRAFT,
                    isArchived: false,
                },
                data: {
                    status: ProductStatus.PENDING_APPROVAL,
                },
            });

            const outboxSubmitCall = mockTransactionPrisma.outboxEvent.create
                .mock.calls[0] as unknown[];
            const outboxSubmitArg = outboxSubmitCall[0] as { data: unknown };
            expect(outboxSubmitArg).toEqual({
                data: expect.objectContaining({
                    aggregateType: 'Product',
                    aggregateId: 'prod-1',
                    type: 'product.submitted_for_approval',
                }),
            });

            expect(result).toEqual(submittedProduct);
        });

        it('should throw if product was already processed', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                status: ProductStatus.DRAFT,
            });

            mockTransactionPrisma.product.updateMany.mockResolvedValue({
                count: 0,
            });

            await expect(
                service.submitForApproval('prod-1', 'seller-1'),
            ).rejects.toThrow(BadRequestException);

            expect(
                mockTransactionPrisma.product.findUniqueOrThrow,
            ).not.toHaveBeenCalled();

            expect(
                mockTransactionPrisma.outboxEvent.create,
            ).not.toHaveBeenCalled();
        });
    });
});
