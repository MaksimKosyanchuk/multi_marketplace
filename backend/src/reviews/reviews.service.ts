import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma, type Review } from '@prisma/client';
import { getCorrelationId } from '../common/correlation/correlation.context';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) {}

    async create(authorId: string, dto: CreateReviewDto) {
        if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
            throw new BadRequestException(
                'Rating must be an integer from 1 to 5',
            );
        }
        const review = await this.prisma.$transaction(
            async (tx: Prisma.TransactionClient): Promise<Review> => {
                const orderItem = await tx.orderItem.findUnique({
                    where: { id: dto.orderItemId },
                    include: { sellerOrder: { include: { order: true } } },
                });

                if (!orderItem)
                    throw new NotFoundException('Order item not found');
                if (orderItem.sellerOrder.order.userId !== authorId) {
                    throw new ForbiddenException(
                        'You can only review your own purchases',
                    );
                }
                if (orderItem.sellerOrder.status !== 'COMPLETED') {
                    throw new ConflictException(
                        'A review requires a completed seller order',
                    );
                }
                if (
                    await tx.review.findUnique({
                        where: { orderItemId: dto.orderItemId },
                    })
                ) {
                    throw new ConflictException(
                        'This order item has already been reviewed',
                    );
                }

                let review: Review;
                try {
                    review = await tx.review.create({
                        data: {
                            orderItemId: dto.orderItemId,
                            productId: orderItem.productId,
                            authorId,
                            rating: dto.rating,
                            comment: dto.comment?.trim() || null,
                        },
                    });
                } catch (error) {
                    if (
                        error instanceof Prisma.PrismaClientKnownRequestError &&
                        error.code === 'P2002'
                    ) {
                        throw new ConflictException(
                            'This order item has already been reviewed',
                        );
                    }
                    throw error;
                }

                await tx.outboxEvent.create({
                    data: {
                        aggregateType: 'Review',
                        aggregateId: review.id,
                        type: 'review.created',
                        payload: {
                            reviewId: review.id,
                            productId: review.productId,
                            orderItemId: review.orderItemId,
                            authorId,
                            rating: review.rating,
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: `review-created:${review.id}`,
                    },
                });
                return review;
            },
        );
        await Promise.all([
            this.redis.delByPattern('products:list:*'),
            this.redis.delByPattern('search:products:*'),
            this.redis.delByPattern(`products:detail:${review.productId}`),
        ]);
        return review;
    }

    async findByProduct(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: { id: true },
        });
        if (!product) throw new NotFoundException('Product not found');

        const [reviews, aggregate] = await this.prisma.$transaction([
            this.prisma.review.findMany({
                where: { productId },
                orderBy: { createdAt: 'desc' },
                include: { author: { select: { id: true, nickName: true } } },
            }),
            this.prisma.review.aggregate({
                where: { productId },
                _avg: { rating: true },
                _count: { _all: true },
            }),
        ]);

        return {
            productId,
            averageRating: aggregate._avg.rating ?? 0,
            reviewCount: aggregate._count._all,
            reviews,
        };
    }

    async findByAuthor(authorId: string) {
        return this.prisma.review.findMany({
            where: { authorId },
            select: { productId: true, orderItemId: true },
        });
    }
}
