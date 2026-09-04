import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

const reviewListInclude = {
    author: { select: { id: true, nickName: true } },
} satisfies Prisma.ReviewInclude;

@Injectable()
export class ReviewRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findByOrderItemId(orderItemId: string, db: DatabaseClient = this.prisma) {
        return db.review.findUnique({ where: { orderItemId } });
    }

    create(
        data: Prisma.ReviewCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.review.create({ data });
    }

    findByProduct(productId: string, db: DatabaseClient = this.prisma) {
        return db.review.findMany({
            where: { productId },
            orderBy: { createdAt: 'desc' },
            include: reviewListInclude,
        });
    }

    aggregateByProduct(productId: string, db: DatabaseClient = this.prisma) {
        return db.review.aggregate({
            where: { productId },
            _avg: { rating: true },
            _count: { _all: true },
        });
    }

    findByAuthor(authorId: string, db: DatabaseClient = this.prisma) {
        return db.review.findMany({
            where: { authorId },
            select: { productId: true, orderItemId: true },
        });
    }
}
