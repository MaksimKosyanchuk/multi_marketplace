import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma, type Review } from '@prisma/client';
import { getCorrelationId } from '../common/correlation/correlation.context';
import { ProductRepository } from '../database/product.repository';
import { ReviewRepository } from '../database/review.repository';
import { UnitOfWork } from '../database/unit-of-work';
import { RedisService } from '../redis/redis.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
    constructor(
        private readonly reviews: ReviewRepository,
        private readonly products: ProductRepository,
        private readonly unitOfWork: UnitOfWork,
        private readonly redis: RedisService,
    ) {}

    async create(authorId: string, dto: CreateReviewDto) {
        if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
            throw new BadRequestException(
                'Rating must be an integer from 1 to 5',
            );
        }
        const review = await this.unitOfWork.run(
            async ({
                reviewRepository,
                orderRepository,
                outboxRepository,
            }): Promise<Review> => {
                const orderItem = await orderRepository.findOrderItemForReview(
                    dto.orderItemId,
                );

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
                if (await reviewRepository.findByOrderItemId(dto.orderItemId)) {
                    throw new ConflictException(
                        'This order item has already been reviewed',
                    );
                }

                let created: Review;
                try {
                    created = await reviewRepository.create({
                        orderItemId: dto.orderItemId,
                        productId: orderItem.productId,
                        authorId,
                        rating: dto.rating,
                        comment: dto.comment?.trim() || null,
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

                await outboxRepository.create({
                    aggregateType: 'Review',
                    aggregateId: created.id,
                    type: 'review.created',
                    payload: {
                        reviewId: created.id,
                        productId: created.productId,
                        orderItemId: created.orderItemId,
                        authorId,
                        rating: created.rating,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `review-created:${created.id}`,
                });
                return created;
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
        const product = await this.products.findByIdSelectId(productId);
        if (!product) throw new NotFoundException('Product not found');

        const [reviews, aggregate] = await Promise.all([
            this.reviews.findByProduct(productId),
            this.reviews.aggregateByProduct(productId),
        ]);

        return {
            productId,
            averageRating: aggregate._avg.rating ?? 0,
            reviewCount: aggregate._count._all,
            reviews,
        };
    }

    async findByAuthor(authorId: string) {
        return this.reviews.findByAuthor(authorId);
    }
}
