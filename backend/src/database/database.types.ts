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
}
