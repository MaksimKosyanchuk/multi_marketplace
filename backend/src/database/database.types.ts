import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DatabaseClient = PrismaService | Prisma.TransactionClient;

export interface TransactionRepositories {
    cartRepository: import('./cart.repository').CartRepository;
    orderRepository: import('./order.repository').OrderRepository;
    outboxRepository: import('./outbox.repository').OutboxRepository;
    productRepository: import('./product.repository').ProductRepository;
    auctionRepository: import('./auction.repository').AuctionRepository;
    bidRepository: import('./auction.repository').BidRepository;
    userRepository: import('./user.repository').UserRepository;
    refreshTokenRepository: import('./refresh-token.repository').RefreshTokenRepository;
    categoryRepository: import('./category.repository').CategoryRepository;
    notificationRepository: import('./notification.repository').NotificationRepository;
    logRepository: import('./log.repository').LogRepository;
    sellerProfileRepository: import('./seller-profile.repository').SellerProfileRepository;
    reviewRepository: import('./review.repository').ReviewRepository;
    disputeRepository: import('./dispute.repository').DisputeRepository;
    analyticsRepository: import('./analytics.repository').AnalyticsRepository;
}
