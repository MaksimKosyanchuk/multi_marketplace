import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ProductSort } from './dto/query-product.dto';
import { ProductsService } from './products.service';
import { LoggerService } from '../logger/logger.service';
import * as fileUtils from '../common/utils/file';

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
        imageUrl: '/uploads/phone.jpg',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: mockCategory,
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
        $transaction: jest.fn(),
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
            ],
        }).compile();

        service = module.get<ProductsService>(ProductsService);
        prisma = module.get(PrismaService);
        redis = module.get(RedisService);

        jest.clearAllMocks();
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
                meta: { total: 1, page: 1, limit: 10, pageCount: 1 },
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
            prisma.$transaction.mockResolvedValue([[mockProduct], 1]);

            const result = await service.findAll(query);

            expect(prisma.$transaction).toHaveBeenCalled();
            expect(redis.set).toHaveBeenCalledWith(
                `products:list:${JSON.stringify(query)}`,
                JSON.stringify(result),
                60,
            );
            expect(result).toEqual({
                items: [mockProduct],
                meta: { total: 1, page: 1, limit: 10, pageCount: 1 },
            });
        });
    });

    describe('findOne', () => {
        it('should return a product by id', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            const result = await service.findOne('prod-1');

            expect(prisma.product.findUnique).toHaveBeenCalledWith({
                where: { id: 'prod-1' },
                include: { category: true },
            });
            expect(result).toEqual(mockProduct);
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
            prisma.product.create.mockResolvedValue(mockProduct);

            const result = await service.create(dto, 'seller-1', '/uploads/phone.jpg');

            expect(prisma.category.findUnique).toHaveBeenCalledWith({
                where: { id: 'cat-1' },
            });
            expect(prisma.product.create).toHaveBeenCalledWith({
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
            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
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
            expect(prisma.product.create).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        const dto = {
            name: 'Updated Smartphone',
            imageUrl: '/uploads/new-phone.jpg',
        };

        it('should update product, delete old image, and invalidate cache', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);
            prisma.product.update.mockResolvedValue({
                ...mockProduct,
                ...dto,
            });

            const result = await service.update('prod-1', dto, 'seller-1');

            expect(prisma.product.update).toHaveBeenCalled();
            expect(fileUtils.deleteFile).toHaveBeenCalledWith(
                '/uploads/phone.jpg',
            );
            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
            expect(result.name).toBe('Updated Smartphone');
        });

        it('should delete newly uploaded file if update fails', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);

            prisma.product.update.mockImplementationOnce(() =>
                Promise.reject(new Error('DB Error')),
            );

            await expect(
                service.update('prod-1', dto, 'seller-1', '/uploads/temp.jpg'),
            ).rejects.toThrow('DB Error');

            expect(fileUtils.deleteFile).toHaveBeenCalledWith(
                '/uploads/temp.jpg',
            );
        });
    });

    describe('remove', () => {
        it('should archive product, delete cart items, and invalidate caches', async () => {
            prisma.product.findUnique.mockResolvedValue(mockProduct);
            prisma.$transaction.mockResolvedValue([{}, {}]);

            const result = await service.remove('prod-1', 'seller-1');

            expect(prisma.$transaction).toHaveBeenCalled();
            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
            expect(redis.delByPattern).toHaveBeenCalledWith('cart:*');
            expect(result).toEqual({ success: true });
        });
    });

    describe('restore', () => {
        it('should restore archived product and invalidate cache', async () => {
            prisma.product.findUnique.mockResolvedValue({
                ...mockProduct,
                isArchived: true,
            });
            prisma.product.update.mockResolvedValue(mockProduct);

            const result = await service.restore('prod-1', 'seller-1');

            expect(prisma.product.update).toHaveBeenCalledWith({
                where: { id: 'prod-1' },
                data: { isArchived: false },
            });
            expect(redis.delByPattern).toHaveBeenCalledWith('products:list:*');
            expect(result.isArchived).toBe(false);
        });
    });
});
