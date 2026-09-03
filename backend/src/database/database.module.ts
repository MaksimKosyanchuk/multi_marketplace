import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartRepository } from './cart.repository';
import { OrderRepository } from './order.repository';
import { OutboxRepository } from './outbox.repository';
import { ProductRepository } from './product.repository';
import { AuctionRepository, BidRepository } from './auction.repository';
import { UnitOfWork } from './unit-of-work';

@Global()
@Module({
    imports: [PrismaModule],
    providers: [
        CartRepository,
        OrderRepository,
        OutboxRepository,
        ProductRepository,
        AuctionRepository,
        BidRepository,
        UnitOfWork,
    ],
    exports: [
        CartRepository,
        OrderRepository,
        OutboxRepository,
        ProductRepository,
        AuctionRepository,
        BidRepository,
        UnitOfWork,
    ],
})
export class DatabaseModule {}
