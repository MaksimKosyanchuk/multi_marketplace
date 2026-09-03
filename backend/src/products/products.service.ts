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
import { getCorrelationId } from '../common/correlation/correlation.context';

interface ProductWithCategory {
    id: string;
    sellerId: string;
    name: string;
    description: string;
    price: any;
    stock: number;
    imageUrl: string | null;
    isArchived: boolean;
    status: ProductStatus;
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

    async findSellerProducts(
        sellerId: string,
        query: QueryProductDto,
    ): Promise<PaginatedProductsResult> {
        const { page, limit, sort } = query;
        const where: Prisma.ProductWhereInput = {
            sellerId,
            ...(query.includeArchived
                ? {}
                : { isArchived: false }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    {
                        description: {
                            contains: query.search,
                            mode: 'insensitive',
                        },
                    },
                ],
            }),
            ...(query.categoryId && { categoryId: query.categoryId }),
            ...(query.type && { type: query.type }),
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
        return {
            items,
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };
    }

    async submitForApproval(id: string, sellerId: string) {
        await this.findOwnedProduct(id, sellerId);
        const product = await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.product.updateMany({
                where: {
                    id,
                    sellerId,
                    status: ProductStatus.DRAFT,
                    isArchived: false,
                },
                data: { status: ProductStatus.PENDING_APPROVAL },
            });
            if (!claimed.count) {
                throw new BadRequestException(
                    'Only non-archived draft products can be submitted for approval',
                );
            }
            const submitted = await tx.product.findUniqueOrThrow({
                where: { id },
                include: { category: true },
            });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.submitted_for_approval',
                    payload: {
                        productId: id,
                        sellerId,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `product-submitted-for-approval:${id}:${submitted.version}`,
                },
            });
            return submitted;
        });
        await this.redis.delByPattern(`${this.CACHE_PREFIX}*`);
        return product;
    }

    async findPendingApproval(query: QueryProductDto): Promise<PaginatedProductsResult> {
        const { page, limit, sort } = query;
        const where: Prisma.ProductWhereInput = {
            status: ProductStatus.PENDING_APPROVAL,
            isArchived: false,
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { description: { contains: query.search, mode: 'insensitive' } },
                ],
            }),
            ...(query.categoryId && { categoryId: query.categoryId }),
            ...(query.sellerId && { sellerId: query.sellerId }),
            ...(query.type && { type: query.type }),
        };
        const orderBy: Prisma.ProductOrderByWithRelationInput =
            sort === ProductSort.PRICE_ASC
                ? { price: 'asc' }
                : sort === ProductSort.PRICE_DESC
                  ? { price: 'desc' }
                  : { createdAt: 'asc' };
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
        return {
            items,
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };
    }

    async approve(id: string, adminId: string, comment?: string) {
        return this.moderate(id, adminId, ProductStatus.ACTIVE, comment);
    }

    async reject(id: string, adminId: string, comment?: string) {
        return this.moderate(id, adminId, ProductStatus.REJECTED, comment);
    }

    private async moderate(
        id: string,
        adminId: string,
        status: ProductStatus,
        comment?: string,
    ) {
        const existing = await this.prisma.product.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Product not found');
        if (
            existing.status !== ProductStatus.PENDING_APPROVAL ||
            existing.isArchived
        ) {
            throw new BadRequestException(
                'Only non-archived products pending approval can be moderated',
            );
        }

        const product = await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.product.updateMany({
                where: {
                    id,
                    status: ProductStatus.PENDING_APPROVAL,
                    isArchived: false,
                },
                data: {
                    status,
                    version: { increment: 1 },
                },
            });
            if (!claimed.count) {
                throw new BadRequestException(
                    'Product was already processed by another administrator',
                );
            }
            const updated = await tx.product.findUniqueOrThrow({
                where: { id },
                include: { category: true },
            });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: status === ProductStatus.ACTIVE
                        ? 'product.approved'
                        : 'product.rejected',
                    payload: {
                        productId: id,
                        adminId,
                        comment,
                        status,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `product-moderated:${id}:${updated.version}:${status}`,
                },
            });
            return updated;
        });
        await this.redis.delByPattern(`${this.CACHE_PREFIX}*`);
        return product;
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
                        payload: { productId: created.id, correlationId: getCorrelationId() },
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
                            payload: { productId: updated.id, correlationId: getCorrelationId() },
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
            const claimed = await tx.product.updateMany({
                where: { id, sellerId, isArchived: false },
                data: {
                    isArchived: true,
                    status: ProductStatus.ARCHIVED,
                    version: { increment: 1 },
                },
            });
            if (!claimed.count) {
                throw new BadRequestException('Product is already archived');
            }
            const archived = await tx.product.findUniqueOrThrow({
                where: { id },
            });
            await tx.cartItem.deleteMany({ where: { productId: id } });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.archived',
                    payload: { productId: id, correlationId: getCorrelationId() },
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
            const claimed = await tx.product.updateMany({
                where: { id, sellerId, isArchived: true },
                data: {
                    isArchived: false,
                    status: ProductStatus.DRAFT,
                    version: { increment: 1 },
                },
            });
            if (!claimed.count) {
                throw new BadRequestException('Only archived products can be restored');
            }
            const restored = await tx.product.findUniqueOrThrow({
                where: { id },
            });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.restored',
                    payload: {
                        productId: id,
                        status: ProductStatus.DRAFT,
                        correlationId: getCorrelationId(),
                    },
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
