import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionRepository, BidRepository } from './auction.repository';
import { CartRepository } from './cart.repository';
import { OrderRepository } from './order.repository';
import { OutboxRepository } from './outbox.repository';
import { ProductRepository } from './product.repository';
import { TransactionRepositories } from './database.types';

@Injectable()
export class UnitOfWork {
    constructor(private readonly prisma: PrismaService) {}

    run<T>(callback: (repositories: TransactionRepositories) => Promise<T>) {
        return this.prisma.$transaction((tx) =>
            callback({
                cartRepository: new CartRepository(tx),
                orderRepository: new OrderRepository(tx),
                outboxRepository: new OutboxRepository(tx),
                productRepository: new ProductRepository(tx),
                auctionRepository: new AuctionRepository(tx),
                bidRepository: new BidRepository(tx),
            }),
        );
    }
}
