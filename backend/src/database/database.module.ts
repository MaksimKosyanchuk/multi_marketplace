import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsRepository } from './analytics.repository';
import { AuctionRepository, BidRepository } from './auction.repository';
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
import { UnitOfWork } from './unit-of-work';
import { UserRepository } from './user.repository';

const repositories = [
    CartRepository,
    OrderRepository,
    OutboxRepository,
    ProductRepository,
    AuctionRepository,
    BidRepository,
    UserRepository,
    RefreshTokenRepository,
    CategoryRepository,
    NotificationRepository,
    LogRepository,
    SellerProfileRepository,
    ReviewRepository,
    DisputeRepository,
    AnalyticsRepository,
    UnitOfWork,
];

@Global()
@Module({
    imports: [PrismaModule],
    providers: repositories,
    exports: repositories,
})
export class DatabaseModule {}
