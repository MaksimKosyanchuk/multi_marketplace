import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionRepository, BidRepository } from './auction.repository';
import { AnalyticsRepository } from './analytics.repository';
import { CartRepository } from './cart.repository';
import { CategoryRepository } from './category.repository';
import { DisputeRepository } from './dispute.repository';
import { LogRepository } from './log.repository';
import { NotificationRepository } from './notification.repository';
import { OrderRepository } from './order.repository';
import { OutboxRepository } from './outbox.repository';
import { ProductRepository } from './product.repository';
import { RefreshTokenRepository } from './refresh-token.repository';
import { ReviewRepository } from './review.repository';
import { SellerProfileRepository } from './seller-profile.repository';
import { UserRepository } from './user.repository';
import { DatabaseClient, TransactionRepositories } from './database.types';

export function createTransactionRepositories(
    client: DatabaseClient,
): TransactionRepositories {
    return {
        cartRepository: new CartRepository(client),
        orderRepository: new OrderRepository(client),
        outboxRepository: new OutboxRepository(client),
        productRepository: new ProductRepository(client),
        auctionRepository: new AuctionRepository(client),
        bidRepository: new BidRepository(client),
        userRepository: new UserRepository(client),
        refreshTokenRepository: new RefreshTokenRepository(client),
        categoryRepository: new CategoryRepository(client),
        notificationRepository: new NotificationRepository(client),
        logRepository: new LogRepository(client),
        sellerProfileRepository: new SellerProfileRepository(client),
        reviewRepository: new ReviewRepository(client),
        disputeRepository: new DisputeRepository(client),
        analyticsRepository: new AnalyticsRepository(client),
    };
}

@Injectable()
export class UnitOfWork {
    constructor(private readonly prisma: PrismaService) {}

    run<T>(
        callback: (repositories: TransactionRepositories) => Promise<T>,
        options?: {
            isolationLevel?: Prisma.TransactionIsolationLevel;
            maxWait?: number;
            timeout?: number;
        },
    ) {
        return this.prisma.$transaction(
            (tx) => callback(createTransactionRepositories(tx)),
            options,
        );
    }
}
