import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartRepository } from './cart.repository';
import { OrderRepository } from './order.repository';
import { OutboxRepository } from './outbox.repository';
import { ProductRepository } from './product.repository';
import { AuctionRepository, BidRepository } from './auction.repository';

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
    ],
    exports: [
        CartRepository,
        OrderRepository,
        OutboxRepository,
        ProductRepository,
        AuctionRepository,
        BidRepository,
    ],
})
export class DatabaseModule {}
