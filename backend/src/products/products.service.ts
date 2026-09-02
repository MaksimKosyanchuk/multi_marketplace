import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductDto } from './dto/query-product.dto';
import { Prisma, ProductStatus } from '@prisma/client';
import { deleteFile } from '../common/utils/file';
import { LoggerService } from '../logger/logger.service';

interface ProductWithCategory {
    id: string;
    sellerId: string;
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
            status: ProductStatus.ACTIVE,
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
            where: { id, status: ProductStatus.ACTIVE, isArchived: false },
            include: { category: true },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }

    async create(
        dto: CreateProductDto,
        sellerId: string,
        uploadedFilePath?: string,
    ) {
        try {
            await this.ensureCategoryExists(dto.categoryId);

            const productData = { ...dto };
            delete (productData as Record<string, unknown>).image;

            const imageUrl = uploadedFilePath ?? dto.imageUrl ?? null;

            const product = await this.prisma.$transaction(async (tx) => {
                const created = await tx.product.create({
                    data: {
                        ...productData,
                        sellerId,
                        slug: this.createSlug(dto.name),
                        description: dto.description ?? '',
                        imageUrl,
                    },
                });
                await tx.outboxEvent.create({
                    data: {
                        aggregateType: 'Product',
                        aggregateId: created.id,
                        type: 'product.created',
                        payload: { productId: created.id },
                        idempotencyKey: `product-created:${created.id}:${created.version}`,
                    },
                });
                return created;
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

    async update(
        id: string,
        dto: UpdateProductDto,
        sellerId: string,
        uploadedFilePath?: string,
    ) {
        const existingProduct = await this.findOwnedProduct(id, sellerId);

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
            const updatedProduct = await this.prisma.$transaction(
                async (tx) => {
                    const updated = await tx.product.update({
                        where: { id },
                        data: {
                            ...productData,
                            imageUrl: newImageUrl,
                        },
                    });
                    await tx.outboxEvent.create({
                        data: {
                            aggregateType: 'Product',
                            aggregateId: updated.id,
                            type: 'product.updated',
                            payload: { productId: updated.id },
                            idempotencyKey: `product-updated:${updated.id}:${updated.version}`,
                        },
                    });
                    return updated;
                },
            );

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

    async remove(id: string, sellerId: string) {
        await this.findOwnedProduct(id, sellerId);

        await this.prisma.$transaction(async (tx) => {
            const archived = await tx.product.update({
                where: { id },
                data: { isArchived: true },
            });
            await tx.cartItem.deleteMany({ where: { productId: id } });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.archived',
                    payload: { productId: id },
                    idempotencyKey: `product-archived:${archived.id}:${archived.version}`,
                },
            });
        });

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

    async restore(id: string, sellerId: string) {
        await this.findOwnedProduct(id, sellerId);

        const product = await this.prisma.$transaction(async (tx) => {
            const restored = await tx.product.update({
                where: { id },
                data: { isArchived: false },
            });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.updated',
                    payload: { productId: id },
                    idempotencyKey: `product-restored:${restored.id}:${restored.version}`,
                },
            });
            return restored;
        });

        await this.redis.delByPattern(`products:list:*`);

        await this.logger.log(
            ProductsService.name,
            `Product restored: ${product.id}`,
        );
        return product;
    }

    private async findOwnedProduct(id: string, sellerId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: { category: true },
        });
        if (!product) throw new NotFoundException('Product not found');
        if (product.sellerId !== sellerId) {
            throw new ForbiddenException('You do not own this product');
        }
        return product;
    }

    private createSlug(name: string): string {
        const normalized = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9а-яіїє]+/gi, '-')
            .replace(/^-+|-+$/g, '');
        return `${normalized || 'product'}-${crypto.randomUUID().slice(0, 8)}`;
    }
}
