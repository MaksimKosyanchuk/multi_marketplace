import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductDto } from './dto/query-product.dto';
import {
    AuctionStatus,
    Prisma,
    ProductStatus,
    ProductType,
} from '@prisma/client';
import { deleteFile } from '../common/utils/file';
import { LoggerService } from '../logger/logger.service';
import { getCorrelationId } from '../common/correlation/correlation.context';
import {
    AuctionRepository,
    CartRepository,
    OutboxRepository,
    ProductRepository,
    UnitOfWork,
} from '../database';

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
    rating?: number;
    reviews?: { rating: number }[];
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
    private readonly DETAIL_CACHE_PREFIX = 'products:detail:';

    constructor(
        private readonly unitOfWork: UnitOfWork,
        private redis: RedisService,
        private logger: LoggerService,
        private readonly productRepository: ProductRepository,
        private readonly auctionRepository: AuctionRepository,
        private readonly cartRepository: CartRepository,
        private readonly outboxRepository: OutboxRepository,
    ) {}

    async findAll(query: QueryProductDto): Promise<PaginatedProductsResult> {
        const cacheKey = this.CACHE_PREFIX + JSON.stringify(query);
        let cached: string | null = null;
        try {
            cached = await this.redis.get(cacheKey);
        } catch {
            // Cache is optional; the database remains authoritative.
        }

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

        const [items, total] = await this.unitOfWork.run(
            async ({ productRepository }) =>
                Promise.all([
                    productRepository.findCatalog(
                        where,
                        orderBy,
                        (page - 1) * limit,
                        limit,
                        {
                            category: true,
                            auction: { select: { id: true, status: true } },
                            reviews: { select: { rating: true } },
                        },
                    ),
                    productRepository.count(where),
                ]),
        );

        const result: PaginatedProductsResult = {
            items: items.map((item) => {
                const { reviews, ...result } = item;

                return {
                    ...result,
                    rating: reviews.length
                        ? reviews.reduce(
                              (sum, review) => sum + review.rating,
                              0,
                          ) / reviews.length
                        : 0,
                };
            }),
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };

        try {
            await this.redis.set(
                cacheKey,
                JSON.stringify(result),
                this.CACHE_TTL,
            );
        } catch {
            // Cache write failures must not fail a product read.
        }

        return result;
    }

    async findSellerProducts(
        sellerId: string,
        query: QueryProductDto,
    ): Promise<PaginatedProductsResult> {
        const { page, limit, sort } = query;
        const where: Prisma.ProductWhereInput = {
            sellerId,
            ...(query.includeArchived ? {} : { isArchived: false }),
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
        const [items, total] = await this.unitOfWork.run(
            async ({ productRepository }) =>
                Promise.all([
                    productRepository.findCatalog(
                        where,
                        orderBy,
                        (page - 1) * limit,
                        limit,
                        {
                            category: true,
                            auction: { select: { id: true } },
                            reviews: { select: { rating: true } },
                        },
                    ),
                    productRepository.count(where),
                ]),
        );
        return {
            items: items.map((item) => {
                const { reviews, ...result } = item as ProductWithCategory & {
                    reviews?: { rating: number }[];
                };

                if (!reviews) return item;

                return {
                    ...result,
                    rating: reviews.length
                        ? reviews.reduce(
                              (sum, review) => sum + review.rating,
                              0,
                          ) / reviews.length
                        : 0,
                };
            }),
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };
    }

    async submitForApproval(id: string, sellerId: string) {
        await this.findOwnedProduct(id, sellerId);
        const product = await this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const claimed = await productRepository.claimStatus(
                    id,
                    {
                        sellerId,
                        status: ProductStatus.DRAFT,
                        isArchived: false,
                    },
                    { status: ProductStatus.PENDING_APPROVAL },
                );
                if (!claimed.count) {
                    throw new BadRequestException(
                        'Only non-archived draft products can be submitted for approval',
                    );
                }
                const submitted =
                    await productRepository.findOrThrowWithDetails(id, {
                        category: true,
                        auction: { select: { id: true, status: true } },
                    });
                await outboxRepository.create({
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.submitted_for_approval',
                    payload: {
                        productId: id,
                        sellerId,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `product-submitted-for-approval:${id}:${submitted.version}`,
                });
                return submitted;
            },
        );
        await this.invalidateProductCaches(id);
        return product;
    }

    async findPendingApproval(
        query: QueryProductDto,
    ): Promise<PaginatedProductsResult> {
        const { page, limit, sort } = query;
        const where: Prisma.ProductWhereInput = {
            status: ProductStatus.PENDING_APPROVAL,
            isArchived: false,
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
            ...(query.sellerId && { sellerId: query.sellerId }),
            ...(query.type && { type: query.type }),
        };
        const orderBy: Prisma.ProductOrderByWithRelationInput =
            sort === ProductSort.PRICE_ASC
                ? { price: 'asc' }
                : sort === ProductSort.PRICE_DESC
                  ? { price: 'desc' }
                  : { createdAt: 'asc' };
        const [items, total] = await this.unitOfWork.run(
            async ({ productRepository }) =>
                Promise.all([
                    productRepository.findCatalog(
                        where,
                        orderBy,
                        (page - 1) * limit,
                        limit,
                        {
                            category: true,
                            auction: { select: { id: true, status: true } },
                        },
                    ),
                    productRepository.count(where),
                ]),
        );
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
        const existing = await this.productRepository.findById(id);
        if (!existing) throw new NotFoundException('Product not found');
        if (
            existing.status !== ProductStatus.PENDING_APPROVAL ||
            existing.isArchived
        ) {
            throw new BadRequestException(
                'Only non-archived products pending approval can be moderated',
            );
        }

        const product = await this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const claimed = await productRepository.claimStatus(
                    id,
                    {
                        status: ProductStatus.PENDING_APPROVAL,
                        isArchived: false,
                    },
                    {
                        status,
                        version: { increment: 1 },
                    },
                );
                if (!claimed.count) {
                    throw new BadRequestException(
                        'Product was already processed by another administrator',
                    );
                }
                const updated = await productRepository.findOrThrowWithDetails(
                    id,
                    { category: true, auction: true },
                );
                if (
                    status === ProductStatus.ACTIVE &&
                    updated.type === ProductType.AUCTION &&
                    updated.auction
                ) {
                    await auctionRepository.activateDraftIfStarted(
                        updated.auction.id,
                    );
                }
                await outboxRepository.create({
                    aggregateType: 'Product',
                    aggregateId: id,
                    type:
                        status === ProductStatus.ACTIVE
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
                });
                return updated;
            },
        );
        await this.invalidateProductCaches(id);
        return product;
    }

    async findOne(id: string): Promise<ProductWithCategory> {
        const cacheKey = `${this.DETAIL_CACHE_PREFIX}${id}`;
        let cached: string | null = null;
        try {
            cached = await this.redis.get(cacheKey);
        } catch {
            // Cache is optional; the database remains authoritative.
        }
        if (cached) return JSON.parse(cached) as ProductWithCategory;

        const product =
            await this.productRepository.findByIdWithCatalogDetails(id);

        if (!product) {
            throw new NotFoundException('Product not found');
        }
        if (product.status !== ProductStatus.ACTIVE || product.isArchived) {
            throw new NotFoundException('Product not found');
        }

        if (!('reviews' in product)) return product;
        const result = {
            ...product,
            rating: product.reviews.length
                ? product.reviews.reduce(
                      (sum, review) => sum + review.rating,
                      0,
                  ) / product.reviews.length
                : 0,
        };
        try {
            await this.redis.set(
                cacheKey,
                JSON.stringify(result),
                this.CACHE_TTL,
            );
        } catch {
            // Cache write failures must not fail a product read.
        }
        return result;
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

            const product = await this.unitOfWork.run(
                async ({
                    cartRepository,
                    orderRepository,
                    outboxRepository,
                    productRepository,
                    auctionRepository,
                    bidRepository,
                }) => {
                    const created = await productRepository.create({
                        ...productData,
                        sellerId,
                        slug: this.createSlug(dto.name),
                        description: dto.description ?? '',
                        imageUrl,
                    });
                    await outboxRepository.create({
                        aggregateType: 'Product',
                        aggregateId: created.id,
                        type: 'product.created',
                        payload: {
                            productId: created.id,
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: `product-created:${created.id}:${created.version}`,
                    });
                    return created;
                },
            );

            await this.invalidateProductCaches(product.id);

            this.logger.log(ProductsService.name, 'Product created', {
                productId: product.id,
                sellerId,
                productName: product.name,
                operation: 'product.create',
            });
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

        if (
            existingProduct.type === 'AUCTION' &&
            existingProduct.status !== ProductStatus.DRAFT
        ) {
            throw new BadRequestException(
                'Published or submitted auctions cannot be edited',
            );
        }

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
            newImageUrl = dto.imageUrl === '' ? null : (dto.imageUrl ?? null);
            isImageChanged = dto.imageUrl !== existingProduct.imageUrl;
        }

        try {
            const updatedProduct = await this.unitOfWork.run(
                async ({ productRepository, outboxRepository }) => {
                    const updated = await productRepository.update(id, {
                        ...productData,
                        imageUrl: newImageUrl,
                        version: { increment: 1 },
                    });
                    await outboxRepository.create({
                        aggregateType: 'Product',
                        aggregateId: updated.id,
                        type: 'product.updated',
                        payload: {
                            productId: updated.id,
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: `product-updated:${updated.id}:${updated.version}`,
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

            await this.invalidateProductCaches(id);

            this.logger.log(ProductsService.name, 'Product updated', {
                productId: updatedProduct.id,
                sellerId,
                productName: updatedProduct.name,
                operation: 'product.update',
            });
            return updatedProduct;
        } catch (error) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath);
            }
            throw error;
        }
    }

    async remove(id: string, sellerId: string) {
        const existingProduct = await this.findOwnedProduct(id, sellerId);

        await this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const claimed = await productRepository.claimStatus(
                    id,
                    { sellerId, isArchived: false },
                    {
                        isArchived: true,
                        status: ProductStatus.ARCHIVED,
                        version: { increment: 1 },
                    },
                );
                if (!claimed.count) {
                    throw new BadRequestException(
                        'Product is already archived',
                    );
                }
                if (existingProduct.type === 'AUCTION') {
                    await auctionRepository.cancelForProduct(id);
                }
                const archived = await productRepository.findOrThrow(id, {});
                await cartRepository.removeProduct(id);
                await outboxRepository.create({
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.archived',
                    payload: {
                        productId: id,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `product-archived:${archived.id}:${archived.version}`,
                });
            },
        );

        await this.invalidateProductCaches(id);
        await this.redis.delByPattern(`cart:*`);

        this.logger.log(ProductsService.name, 'Product archived', {
            productId: id,
            sellerId,
            operation: 'product.archive',
        });

        return { success: true };
    }

    private async ensureCategoryExists(categoryId: string) {
        const category =
            await this.productRepository.categoryExists(categoryId);
        if (!category) throw new BadRequestException('Category not found');
    }

    async restore(id: string, sellerId: string) {
        await this.findOwnedProduct(id, sellerId);

        const product = await this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const claimed = await productRepository.claimStatus(
                    id,
                    { sellerId, isArchived: true },
                    {
                        isArchived: false,
                        status: ProductStatus.DRAFT,
                        version: { increment: 1 },
                    },
                );
                if (!claimed.count) {
                    throw new BadRequestException(
                        'Only archived products can be restored',
                    );
                }
                const restored = await productRepository.findOrThrow(id, {});
                await outboxRepository.create({
                    aggregateType: 'Product',
                    aggregateId: id,
                    type: 'product.restored',
                    payload: {
                        productId: id,
                        status: ProductStatus.DRAFT,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `product-restored:${restored.id}:${restored.version}`,
                });
                return restored;
            },
        );

        await this.invalidateProductCaches(id);

        this.logger.log(ProductsService.name, 'Product restored', {
            productId: product.id,
            sellerId,
            operation: 'product.restore',
        });
        return product;
    }

    private async findOwnedProduct(id: string, sellerId: string) {
        const product = await this.productRepository.findByIdWithCategory(id);
        if (!product) throw new NotFoundException('Product not found');
        if (product.sellerId !== sellerId) {
            throw new ForbiddenException('You do not own this product');
        }
        return product;
    }

    private async invalidateProductCaches(productId: string): Promise<void> {
        await Promise.all([
            this.redis.delByPattern(`${this.CACHE_PREFIX}*`),
            this.redis.delByPattern('search:products:*'),
            this.redis.delByPattern(`${this.DETAIL_CACHE_PREFIX}${productId}`),
        ]);
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
