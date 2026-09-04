import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProductStatus, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

type CatalogProduct = Prisma.ProductGetPayload<{
    include: {
        category: true;
        reviews: { select: { rating: true } };
    };
}>;

@Injectable()
export class ProductRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    decrementStockForCheckout(
        productId: string,
        quantity: number,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.updateMany({
            where: {
                id: productId,
                stock: { gte: quantity },
                status: ProductStatus.ACTIVE,
                type: ProductType.FIXED_PRICE,
                isArchived: false,
            },
            data: {
                stock: { decrement: quantity },
                version: { increment: 1 },
            },
        });
    }

    findById(productId: string, db: DatabaseClient = this.prisma) {
        return db.product.findUnique({ where: { id: productId } });
    }

    findByIdSelectId(productId: string, db: DatabaseClient = this.prisma) {
        return db.product.findUnique({
            where: { id: productId },
            select: { id: true },
        });
    }

    findForSearchIndex(productId: string, db: DatabaseClient = this.prisma) {
        return db.product.findUnique({
            where: { id: productId },
            include: {
                reviews: { select: { rating: true } },
                auction: { select: { id: true, status: true } },
            },
        });
    }

    findAllForSearchIndex(db: DatabaseClient = this.prisma) {
        return db.product.findMany({
            include: {
                reviews: { select: { rating: true } },
                auction: { select: { id: true, status: true } },
            },
        });
    }

    countActiveNotArchived(db: DatabaseClient = this.prisma) {
        return db.product.count({
            where: { status: ProductStatus.ACTIVE, isArchived: false },
        });
    }

    findFallbackHits(
        where: Prisma.ProductWhereInput,
        orderBy: Prisma.ProductOrderByWithRelationInput,
        skip: number,
        take: number,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.findMany({
            where,
            include: {
                category: true,
                reviews: { select: { rating: true } },
                auction: { select: { id: true, status: true } },
            },
            orderBy,
            skip,
            take,
        });
    }

    groupByCategory(
        where: Prisma.ProductWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.groupBy({
            by: ['categoryId'],
            where,
            _count: { _all: true },
        });
    }

    groupBySeller(
        where: Prisma.ProductWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.groupBy({
            by: ['sellerId'],
            where,
            _count: { _all: true },
        });
    }

    groupByType(
        where: Prisma.ProductWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.groupBy({
            by: ['type'],
            where,
            _count: { _all: true },
        });
    }

    findByIdWithCategory(productId: string, db: DatabaseClient = this.prisma) {
        return db.product.findUnique({
            where: { id: productId },
            include: { category: true },
        });
    }

    findCatalog(
        where: Prisma.ProductWhereInput,
        orderBy: Prisma.ProductOrderByWithRelationInput,
        skip: number,
        take: number,
        include: Prisma.ProductInclude,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.findMany({ where, orderBy, skip, take, include });
    }

    findByIdWithCatalogDetails(
        productId: string,
        db: DatabaseClient = this.prisma,
    ): Promise<CatalogProduct | null> {
        return db.product.findUnique({
            where: { id: productId },
            include: {
                category: true,
                reviews: { select: { rating: true } },
            },
        });
    }

    findCatalogDetails(
        productId: string,
        where: Prisma.ProductWhereInput,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.findFirst({
            where: { id: productId, ...where },
            include: {
                category: true,
                reviews: { select: { rating: true } },
            },
        });
    }

    categoryExists(categoryId: string, db: DatabaseClient = this.prisma) {
        return db.category.findUnique({ where: { id: categoryId } });
    }

    findOwned(
        productId: string,
        sellerId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.findFirst({
            where: { id: productId, sellerId },
            include: { category: true },
        });
    }

    list(
        where: Prisma.ProductWhereInput,
        orderBy: Prisma.ProductOrderByWithRelationInput,
        skip: number,
        take: number,
        include: Prisma.ProductInclude,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.findMany({ where, orderBy, skip, take, include });
    }

    count(where: Prisma.ProductWhereInput, db: DatabaseClient = this.prisma) {
        return db.product.count({ where });
    }

    create(
        data: Prisma.ProductCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.create({ data });
    }

    update(
        productId: string,
        data: Prisma.ProductUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.update({ where: { id: productId }, data });
    }

    claimStatus(
        productId: string,
        where: Prisma.ProductWhereInput,
        data: Prisma.ProductUpdateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.updateMany({
            where: { id: productId, ...where },
            data,
        });
    }

    findOrThrow(
        productId: string,
        include: Prisma.ProductInclude,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.findUniqueOrThrow({
            where: { id: productId },
            ...(Object.keys(include).length ? { include } : {}),
        });
    }

    findOrThrowWithDetails(
        productId: string,
        include: Prisma.ProductInclude,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.findUniqueOrThrow({
            where: { id: productId },
            include,
        });
    }

    incrementStock(
        productId: string,
        quantity: number,
        db: DatabaseClient = this.prisma,
    ) {
        return db.product.update({
            where: { id: productId },
            data: {
                stock: { increment: quantity },
                version: { increment: 1 },
            },
        });
    }
}
