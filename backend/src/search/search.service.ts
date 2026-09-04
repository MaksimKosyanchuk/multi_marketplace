import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus, ProductType } from '@prisma/client';
import { ProductRepository } from '../database/product.repository';
import { UnitOfWork } from '../database/unit-of-work';
import { RedisService } from '../redis/redis.service';
import {
    ProductSort,
    QueryProductDto,
} from '../products/dto/query-product.dto';
import { LoggerService } from '../logger/logger.service';

type SearchDocument = {
    id: string;
    sellerId: string;
    categoryId: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    type: ProductType;
    status: ProductStatus;
    isArchived: boolean;
    rating: number;
    createdAt: string;
    auctionId?: string;
    auctionStatus?: string;
};

type SearchResult = {
    hits: unknown[];
    estimatedTotalHits: number;
    page?: number;
    limit?: number;
    facetDistribution?: {
        categoryId?: Record<string, number>;
        sellerId?: Record<string, number>;
        type?: Record<string, number>;
    };
};

@Injectable()
export class SearchService implements OnModuleInit {
    private readonly logger = new Logger(SearchService.name);
    private readonly host: string;
    private readonly index = 'products';
    private readonly cachePrefix = 'search:products:';
    private readonly cacheTtl = 30;
    private reindexPromise?: Promise<void>;
    private lastRecoveryWarningAt = 0;

    constructor(
        private readonly products: ProductRepository,
        private readonly unitOfWork: UnitOfWork,
        config: ConfigService,
        private readonly redis: RedisService,
        private readonly auditLogger: LoggerService,
    ) {
        this.host = config.get<string>(
            'MEILISEARCH_URL',
            'http://localhost:7700',
        );
    }

    async onModuleInit(): Promise<void> {
        try {
            await this.request('/indexes/products', 'POST', {
                uid: 'products',
                primaryKey: 'id',
            });
        } catch {
            //
        }
        try {
            await this.request(
                '/indexes/products/settings/filterable-attributes',
                'PUT',
                [
                    'sellerId',
                    'categoryId',
                    'type',
                    'status',
                    'isArchived',
                    'price',
                    'stock',
                    'rating',
                ],
            );
            await this.request(
                '/indexes/products/settings/sortable-attributes',
                'PUT',
                ['price', 'rating', 'createdAt'],
            );
            await this.request('/indexes/products/settings/faceting', 'PUT', [
                'categoryId',
                'sellerId',
                'type',
                'rating',
                'price',
                'stock',
            ]);
        } catch (error: unknown) {
            this.logger.warn(
                `Meilisearch settings unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
        }
        try {
            await this.reindexAllProducts();
        } catch (error: unknown) {
            this.logger.warn(
                `Meilisearch reindex unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
        }
    }

    async search(query: QueryProductDto): Promise<SearchResult> {
        const cacheKey = this.cachePrefix + JSON.stringify(query);
        const cached = await this.readCache(cacheKey);
        if (cached) return JSON.parse(cached) as SearchResult;

        try {
            const body: Record<string, unknown> = {
                q: query.search ?? '',
                limit: query.limit,
                offset: (query.page - 1) * query.limit,
                facets: ['categoryId', 'sellerId', 'type'],
            };
            const filters = [
                'status = ACTIVE',
                'isArchived = false',
                '(type = FIXED_PRICE OR auctionStatus = ACTIVE)',
            ];
            if (query.categoryId)
                filters.push(`categoryId = ${query.categoryId}`);
            if (query.sellerId) filters.push(`sellerId = ${query.sellerId}`);
            if (query.type) filters.push(`type = ${query.type}`);
            if (query.minPrice !== undefined)
                filters.push(`price >= ${query.minPrice}`);
            if (query.maxPrice !== undefined)
                filters.push(`price <= ${query.maxPrice}`);
            if (query.minRating !== undefined)
                filters.push(`rating >= ${query.minRating}`);
            if (query.inStock) filters.push('stock > 0');
            body.filter = filters.join(' AND ');
            if (query.sort === ProductSort.PRICE_ASC) body.sort = ['price:asc'];
            if (query.sort === ProductSort.PRICE_DESC)
                body.sort = ['price:desc'];
            const response = await fetch(
                `${this.host}/indexes/${this.index}/search`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body),
                },
            );
            if (!response.ok)
                throw new Error(`Meilisearch returned ${response.status}`);
            const result = (await response.json()) as {
                estimatedTotalHits?: number;
                hits?: unknown[];
            };
            if (
                result.estimatedTotalHits === 0 &&
                (await this.products.countActiveNotArchived()) > 0
            ) {
                this.recoverEmptyIndex();
                const fallback = await this.fallback(query);
                await this.writeCache(cacheKey, fallback);
                return fallback;
            }
            await this.writeCache(cacheKey, result);
            return {
                ...result,
                estimatedTotalHits: result.estimatedTotalHits ?? 0,
                hits: result.hits ?? [],
            };
        } catch (error: unknown) {
            this.logger.warn(
                `Search unavailable, using PostgreSQL fallback: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            const fallback = await this.fallback(query);
            await this.writeCache(cacheKey, fallback);
            return fallback;
        }
    }

    private async readCache(key: string): Promise<string | null> {
        try {
            return await this.redis.get(key);
        } catch (error: unknown) {
            this.logger.warn(
                `Search cache read unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            return null;
        }
    }

    private async writeCache(key: string, value: unknown): Promise<void> {
        try {
            await this.redis.set(key, JSON.stringify(value), this.cacheTtl);
        } catch (error: unknown) {
            this.logger.warn(
                `Search cache write unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
        }
    }

    async invalidateProductCaches(): Promise<void> {
        await this.redis.delByPattern(`${this.cachePrefix}*`);
    }

    async indexProduct(productId: string): Promise<void> {
        const product = await this.products.findForSearchIndex(productId);
        if (!product) return;
        const rating = product.reviews.length
            ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
              product.reviews.length
            : 0;
        await this.request(
            `/indexes/${this.index}/documents?primaryKey=id`,
            'POST',
            [this.toSearchDocument(product, rating)],
        );
        void this.auditLogger.audit(
            SearchService.name,
            'Search index success',
            {
                productId,
                operation: 'search.index',
            },
        );
    }

    private async reindexAllProducts(): Promise<void> {
        const products = await this.products.findAllForSearchIndex();
        if (!products.length) return;

        await this.request(
            `/indexes/${this.index}/documents?primaryKey=id`,
            'POST',
            products.map((product) => {
                const rating = product.reviews.length
                    ? product.reviews.reduce(
                          (sum, review) => sum + review.rating,
                          0,
                      ) / product.reviews.length
                    : 0;
                return this.toSearchDocument(product, rating);
            }),
        );
        this.logger.log(`Indexed ${products.length} existing products`);
    }

    private recoverEmptyIndex(): void {
        const now = Date.now();
        if (now - this.lastRecoveryWarningAt >= 60_000) {
            this.lastRecoveryWarningAt = now;
            this.logger.warn(
                'Meilisearch is empty while PostgreSQL has active products; using PostgreSQL fallback and scheduling reindex',
            );
        }
        if (this.reindexPromise) return;

        this.reindexPromise = this.reindexAllProducts()
            .catch((error: unknown) => {
                this.logger.warn(
                    `Meilisearch recovery failed: ${error instanceof Error ? error.message : 'unknown error'}`,
                );
            })
            .finally(() => {
                this.reindexPromise = undefined;
            });
    }

    private toSearchDocument(
        product: {
            id: string;
            sellerId: string;
            categoryId: string;
            name: string;
            description: string;
            price: unknown;
            stock: number;
            type: ProductType;
            status: ProductStatus;
            isArchived: boolean;
            createdAt: Date;
            auction?: { id: string; status: string } | null;
        },
        rating: number,
    ): SearchDocument {
        return {
            id: product.id,
            sellerId: product.sellerId,
            categoryId: product.categoryId,
            name: product.name,
            description: product.description,
            price: Number(product.price),
            stock: product.stock,
            type: product.type,
            status: product.status,
            isArchived: product.isArchived,
            rating,
            createdAt: product.createdAt.toISOString(),
            ...(product.auction ? { auctionId: product.auction.id } : {}),
            ...(product.auction
                ? { auctionStatus: product.auction.status }
                : {}),
        };
    }

    async deleteProduct(productId: string): Promise<void> {
        await this.request(
            `/indexes/${this.index}/documents/${productId}`,
            'DELETE',
        );
        void this.auditLogger.audit(
            SearchService.name,
            'Search index delete success',
            {
                productId,
                operation: 'search.delete',
            },
        );
    }

    private async request(path: string, method: string, body?: unknown) {
        const response = await fetch(`${this.host}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok)
            throw new Error(`Meilisearch returned ${response.status}`);
    }

    private fallback(query: QueryProductDto) {
        const where: Prisma.ProductWhereInput = {
            status: ProductStatus.ACTIVE,
            isArchived: false,
            AND: [
                {
                    OR: [
                        { type: ProductType.FIXED_PRICE },
                        {
                            type: ProductType.AUCTION,
                            auction: { status: 'ACTIVE' },
                        },
                    ],
                },
            ],
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
            ...(query.inStock && { stock: { gt: 0 } }),
            ...(query.minRating !== undefined && {
                reviews: { some: { rating: { gte: query.minRating } } },
            }),
            ...((query.minPrice !== undefined ||
                query.maxPrice !== undefined) && {
                price: {
                    ...(query.minPrice !== undefined && {
                        gte: query.minPrice,
                    }),
                    ...(query.maxPrice !== undefined && {
                        lte: query.maxPrice,
                    }),
                },
            }),
        };
        return this.unitOfWork.run(async ({ productRepository }) => {
            const [hits, total, categoryFacets, sellerFacets, typeFacets] =
                await Promise.all([
                    productRepository.findFallbackHits(
                        where,
                        query.sort === ProductSort.PRICE_ASC
                            ? { price: 'asc' }
                            : query.sort === ProductSort.PRICE_DESC
                              ? { price: 'desc' }
                              : { createdAt: 'desc' },
                        (query.page - 1) * query.limit,
                        query.limit,
                    ),
                    productRepository.count(where),
                    productRepository.groupByCategory(where),
                    productRepository.groupBySeller(where),
                    productRepository.groupByType(where),
                ]);
            return {
                hits: hits.map((product) => ({
                    ...product,
                    ...(product.auction
                        ? {
                              auctionId: product.auction.id,
                              auctionStatus: product.auction.status,
                          }
                        : {}),
                    rating: product.reviews.length
                        ? product.reviews.reduce(
                              (sum, review) => sum + review.rating,
                              0,
                          ) / product.reviews.length
                        : 0,
                })),
                estimatedTotalHits: total,
                page: query.page,
                limit: query.limit,
                facetDistribution: {
                    categoryId: Object.fromEntries(
                        categoryFacets.map((item) => [
                            item.categoryId,
                            item._count._all,
                        ]),
                    ),
                    sellerId: Object.fromEntries(
                        sellerFacets.map((item) => [
                            item.sellerId,
                            item._count._all,
                        ]),
                    ),
                    type: Object.fromEntries(
                        typeFacets.map((item) => [item.type, item._count._all]),
                    ),
                },
            };
        });
    }
}
