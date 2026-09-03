import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    ProductSort,
    QueryProductDto,
} from '../products/dto/query-product.dto';

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
};

@Injectable()
export class SearchService implements OnModuleInit {
    private readonly logger = new Logger(SearchService.name);
    private readonly host: string;
    private readonly index = 'products';

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService,
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
            // The index already exists; settings are still applied below.
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

    async search(query: QueryProductDto) {
        try {
            const body: Record<string, unknown> = {
                q: query.search ?? '',
                limit: query.limit,
                offset: (query.page - 1) * query.limit,
                facets: ['categoryId', 'sellerId', 'type'],
            };
            const filters = ['status = ACTIVE', 'isArchived = false'];
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
                (await this.prisma.product.count({
                    where: { status: ProductStatus.ACTIVE, isArchived: false },
                })) > 0
            ) {
                this.logger.warn(
                    'Meilisearch returned no products while PostgreSQL has active products; using PostgreSQL fallback',
                );
                return this.fallback(query);
            }
            return result;
        } catch (error: unknown) {
            this.logger.warn(
                `Search unavailable, using PostgreSQL fallback: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            return this.fallback(query);
        }
    }

    async indexProduct(productId: string): Promise<void> {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            include: { reviews: { select: { rating: true } } },
        });
        if (!product) return;
        const rating = product.reviews.length
            ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
              product.reviews.length
            : 0;
        await this.request(`/indexes/${this.index}/documents`, 'POST', [
            this.toSearchDocument(product, rating),
        ]);
    }

    private async reindexAllProducts(): Promise<void> {
        const products = await this.prisma.product.findMany({
            include: { reviews: { select: { rating: true } } },
        });
        if (!products.length) return;

        await this.request(
            `/indexes/${this.index}/documents`,
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
        };
    }

    async deleteProduct(productId: string): Promise<void> {
        await this.request(
            `/indexes/${this.index}/documents/${productId}`,
            'DELETE',
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
        return this.prisma.$transaction(async (tx) => {
            const [hits, total, categoryFacets, sellerFacets, typeFacets] =
                await Promise.all([
                    tx.product.findMany({
                        where,
                        include: {
                            category: true,
                            reviews: { select: { rating: true } },
                        },
                        orderBy:
                            query.sort === 'price_asc'
                                ? { price: 'asc' }
                                : query.sort === 'price_desc'
                                  ? { price: 'desc' }
                                  : { createdAt: 'desc' },
                        skip: (query.page - 1) * query.limit,
                        take: query.limit,
                    }),
                    tx.product.count({ where }),
                    tx.product.groupBy({
                        by: ['categoryId'],
                        where,
                        _count: { _all: true },
                    }),
                    tx.product.groupBy({
                        by: ['sellerId'],
                        where,
                        _count: { _all: true },
                    }),
                    tx.product.groupBy({
                        by: ['type'],
                        where,
                        _count: { _all: true },
                    }),
                ]);
            return {
                hits: hits.map((product) => ({
                    ...product,
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
