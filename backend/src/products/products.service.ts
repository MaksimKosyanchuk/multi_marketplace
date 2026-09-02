import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductDto } from './dto/query-product.dto';
import { Prisma } from '@prisma/client';
import { deleteFile } from '../common/utils/file';
import { LoggerService } from '../logger/logger.service';

interface ProductWithCategory {
    id: string;
    name: string;
    description: string;
    price: any;
    stock: number;
    imageUrl: string | null;
    isArchived: boolean;
    categoryId: string;
    createdAt: Date;
    updatedAt: Date;
    category?: unknown;
}

interface PaginatedProductsResult {
    items: ProductWithCategory[];
    meta: {
        total: number;
        page: number;
        limit: number;
        pageCount: number;
    };
}

@Injectable()
export class ProductsService {
    private readonly CACHE_PREFIX = 'products:list:';
    private readonly CACHE_TTL = 60;

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private logger: LoggerService,
    ) {}

    async findAll(query: QueryProductDto): Promise<PaginatedProductsResult> {
        const cacheKey = this.CACHE_PREFIX + JSON.stringify(query);
        const cached = await this.redis.get(cacheKey);

        if (cached) {
            return JSON.parse(cached) as PaginatedProductsResult;
        }

        const {
            search,
            categoryId,
            minPrice,
            maxPrice,
            sort,
            page,
            limit,
            includeArchived,
        } = query;

        const where: Prisma.ProductWhereInput = {
            ...(!includeArchived && { isArchived: false }),
            ...(search && { name: { contains: search, mode: 'insensitive' } }),
            ...(categoryId && { categoryId }),
            ...((minPrice !== undefined || maxPrice !== undefined) && {
                price: {
                    ...(minPrice !== undefined && { gte: minPrice }),
                    ...(maxPrice !== undefined && { lte: maxPrice }),
                },
            }),
        };

        const orderBy: Prisma.ProductOrderByWithRelationInput =
            sort === ProductSort.PRICE_ASC
                ? { price: 'asc' }
                : sort === ProductSort.PRICE_DESC
                  ? { price: 'desc' }
                  : { createdAt: 'desc' };

        const [items, total] = await this.prisma.$transaction([
            this.prisma.product.findMany({
                where,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                include: { category: true },
            }),
            this.prisma.product.count({ where }),
        ]);

        const result: PaginatedProductsResult = {
            items: items,
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };

        await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);

        return result;
    }

    async findOne(id: string): Promise<ProductWithCategory> {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: { category: true },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }

    async create(dto: CreateProductDto, uploadedFilePath?: string) {
        try {
            await this.ensureCategoryExists(dto.categoryId);

            const productData = { ...dto };
            delete (productData as Record<string, unknown>).image;

            const imageUrl = uploadedFilePath ?? dto.imageUrl ?? null;

            const product = await this.prisma.product.create({
                data: {
                    ...productData,
                    description: dto.description ?? '',
                    imageUrl,
                },
            });

            await this.redis.delByPattern(`products:list:*`);

            await this.logger.log(
                ProductsService.name,
                `Product created: ${product.id}`,
                { productName: product.name },
            );
            return product;
        } catch (error) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath);
            }
            throw error;
        }
    }

    async update(id: string, dto: UpdateProductDto, uploadedFilePath?: string) {
        const existingProduct = await this.findOne(id);

        if (dto.categoryId) {
            await this.ensureCategoryExists(dto.categoryId);
        }

        const productData = { ...dto };
        delete (productData as Record<string, unknown>).image;

        let newImageUrl = existingProduct.imageUrl;
        let isImageChanged = false;

        if (uploadedFilePath) {
            newImageUrl = uploadedFilePath;
            isImageChanged = true;
        } else if (dto.imageUrl !== undefined) {
            newImageUrl = dto.imageUrl ?? null;
            isImageChanged = dto.imageUrl !== existingProduct.imageUrl;
        }

        try {
            const updatedProduct = await this.prisma.product.update({
                where: { id },
                data: {
                    ...productData,
                    imageUrl: newImageUrl,
                },
            });

            if (
                isImageChanged &&
                existingProduct.imageUrl &&
                existingProduct.imageUrl !== newImageUrl
            ) {
                await deleteFile(existingProduct.imageUrl);
            }

            await this.redis.delByPattern('products:list:*');
            await this.logger.log(
                ProductsService.name,
                `Product updated: ${updatedProduct.id}`,
                { productName: updatedProduct.name },
            );
            return updatedProduct;
        } catch (error) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath);
            }
            throw error;
        }
    }

    async remove(id: string) {
        await this.findOne(id);

        await this.prisma.$transaction([
            this.prisma.product.update({
                where: { id },
                data: { isArchived: true },
            }),

            this.prisma.cartItem.deleteMany({
                where: { productId: id },
            }),
        ]);

        await this.redis.delByPattern(`products:list:*`);
        await this.redis.delByPattern(`cart:*`);

        await this.logger.log(ProductsService.name, `Product archived: ${id}`);

        return { success: true };
    }

    private async ensureCategoryExists(categoryId: string) {
        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });
        if (!category) throw new BadRequestException('Category not found');
    }

    async restore(id: string) {
        await this.findOne(id);

        const product = await this.prisma.product.update({
            where: { id },
            data: { isArchived: false },
        });

        await this.redis.delByPattern(`products:list:*`);

        await this.logger.log(
            ProductsService.name,
            `Product restored: ${product.id}`,
        );
        return product;
    }
}
