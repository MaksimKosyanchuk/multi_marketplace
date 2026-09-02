import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
    let service: CategoriesService;

    const mockCategory: Prisma.Category = {
        id: 'cat-1',
        name: 'Electronics',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockPrismaService = {
        category: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        product: {
            count: jest.fn(),
        },
    };

    const mockRedisService = {
        delByPattern: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CategoriesService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: RedisService,
                    useValue: mockRedisService,
                },
            ],
        }).compile();

        service = module.get<CategoriesService>(CategoriesService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create a new category', async () => {
            const dto = { name: 'Electronics' };

            mockPrismaService.category.findUnique.mockResolvedValue(null);
            mockPrismaService.category.create.mockResolvedValue(mockCategory);

            const result = await service.create(dto);

            expect(mockPrismaService.category.findUnique).toHaveBeenCalledWith({
                where: { name: dto.name },
            });

            expect(mockPrismaService.category.create).toHaveBeenCalledWith({
                data: { ...dto, slug: 'electronics' },
            });

            expect(result).toEqual(mockCategory);
        });

        it('should throw ConflictException if category name already exists', async () => {
            const dto = { name: 'Electronics' };

            mockPrismaService.category.findUnique.mockResolvedValue(
                mockCategory,
            );

            await expect(service.create(dto)).rejects.toThrow(
                ConflictException,
            );

            expect(mockPrismaService.category.create).not.toHaveBeenCalled();
        });
    });

    describe('findAll', () => {
        it('should return an array of categories ordered by name asc', async () => {
            const categories: Prisma.Category[] = [mockCategory];

            mockPrismaService.category.findMany.mockResolvedValue(categories);

            const result = await service.findAll();

            expect(mockPrismaService.category.findMany).toHaveBeenCalledWith({
                orderBy: { name: 'asc' },
            });

            expect(result).toEqual(categories);
        });
    });

    describe('findOne', () => {
        it('should return category if exists', async () => {
            mockPrismaService.category.findUnique.mockResolvedValue(
                mockCategory,
            );

            const result = await service.findOne('cat-1');

            expect(mockPrismaService.category.findUnique).toHaveBeenCalledWith({
                where: { id: 'cat-1' },
            });

            expect(result).toEqual(mockCategory);
        });

        it('should throw NotFoundException if category does not exist', async () => {
            mockPrismaService.category.findUnique.mockResolvedValue(null);

            await expect(service.findOne('invalid-id')).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('update', () => {
        it('should update category and clear redis cache pattern', async () => {
            const dto = { name: 'Tech Gadgets' };

            const updatedCategory: Prisma.Category = {
                id: 'cat-1',
                name: 'Tech Gadgets',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrismaService.category.findUnique.mockResolvedValue(
                mockCategory,
            );

            mockPrismaService.category.update.mockResolvedValue(
                updatedCategory,
            );

            const result = await service.update('cat-1', dto);

            expect(mockPrismaService.category.update).toHaveBeenCalledWith({
                where: { id: 'cat-1' },
                data: { ...dto, slug: 'tech-gadgets' },
            });

            expect(mockRedisService.delByPattern).toHaveBeenCalledWith(
                'products:list:*',
            );

            expect(result).toEqual(updatedCategory);
        });

        it('should throw NotFoundException if category to update does not exist', async () => {
            mockPrismaService.category.findUnique.mockResolvedValue(null);

            await expect(
                service.update('invalid-id', { name: 'New Name' }),
            ).rejects.toThrow(NotFoundException);

            expect(mockPrismaService.category.update).not.toHaveBeenCalled();

            expect(mockRedisService.delByPattern).not.toHaveBeenCalled();
        });
    });

    describe('remove', () => {
        it('should remove category if it has no active products', async () => {
            mockPrismaService.category.findUnique.mockResolvedValue(
                mockCategory,
            );

            mockPrismaService.product.count.mockResolvedValue(0);

            mockPrismaService.category.delete.mockResolvedValue(mockCategory);

            const result = await service.remove('cat-1');

            expect(mockPrismaService.product.count).toHaveBeenCalledWith({
                where: {
                    categoryId: 'cat-1',
                    isArchived: false,
                },
            });

            expect(mockPrismaService.category.delete).toHaveBeenCalledWith({
                where: { id: 'cat-1' },
            });

            expect(result).toEqual(mockCategory);
        });

        it('should throw ConflictException if category has existing products', async () => {
            mockPrismaService.category.findUnique.mockResolvedValue(
                mockCategory,
            );

            mockPrismaService.product.count.mockResolvedValue(3);

            await expect(service.remove('cat-1')).rejects.toThrow(
                ConflictException,
            );

            expect(mockPrismaService.category.delete).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException if category to remove does not exist', async () => {
            mockPrismaService.category.findUnique.mockResolvedValue(null);

            await expect(service.remove('invalid-id')).rejects.toThrow(
                NotFoundException,
            );

            expect(mockPrismaService.category.delete).not.toHaveBeenCalled();
        });
    });
});
