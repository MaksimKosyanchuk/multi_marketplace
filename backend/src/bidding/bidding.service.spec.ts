import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
    AuctionStatus,
    BidStatus,
    ProductStatus,
    ProductType,
} from '@prisma/client';
import { BiddingService } from './bidding.service';
import {
    AuctionRepository,
    BidRepository,
    OrderRepository,
    OutboxRepository,
    ProductRepository,
    UnitOfWork,
} from '../database';

describe('BiddingService critical auction flows', () => {
    const queue = { add: jest.fn() };
    const logger = { audit: jest.fn(), warn: jest.fn() };
    const prisma = {
        bid: { findUnique: jest.fn() },
        payment: { findUnique: jest.fn() },
        $transaction: jest.fn(),
        $queryRaw: jest.fn(),
    };
    let service: BiddingService;

    const activeAuction = {
        id: 'auction-1',
        productId: 'product-1',
        status: AuctionStatus.ACTIVE,
        version: 3,
        currentPrice: new Prisma.Decimal('100'),
        minBidIncrement: new Prisma.Decimal('10'),
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60_000),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new BiddingService(
            new UnitOfWork(prisma as never),
            queue as never,
            logger as never,
            new AuctionRepository(prisma as never),
            new BidRepository(prisma as never),
            new OrderRepository(prisma as never),
            new OutboxRepository(prisma as never),
            new ProductRepository(prisma as never),
        );
        prisma.bid.findUnique.mockResolvedValue(null);
        prisma.payment.findUnique.mockResolvedValue(null);
    });

    it('rejects a bid at or after the auction deadline', async () => {
        const tx = {
            auction: {
                findUnique: jest.fn().mockResolvedValue({
                    ...activeAuction,
                    endsAt: new Date(Date.now() - 1),
                }),
            },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.placeBid('bidder-1', 'auction-1', 110, 'bid-key-1'),
        ).rejects.toThrow(BadRequestException);
        expect(tx.auction.findUnique).toHaveBeenCalledWith({
            where: { id: 'auction-1' },
        });
    });

    it('accepts a bid only when the optimistic version and price still match', async () => {
        const tx = {
            auction: {
                findUnique: jest.fn().mockResolvedValue(activeAuction),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            bid: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                create: jest.fn().mockResolvedValue({
                    id: 'bid-1',
                    bidderId: 'bidder-1',
                    auctionId: 'auction-1',
                    amount: new Prisma.Decimal('110'),
                }),
            },
            outboxEvent: { create: jest.fn() },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await service.placeBid('bidder-1', 'auction-1', 110, 'bid-key-1');

        expect(tx.auction.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'auction-1',
                status: AuctionStatus.ACTIVE,
                version: 3,
                currentPrice: activeAuction.currentPrice,
            },
            data: {
                currentPrice: new Prisma.Decimal('110'),
                version: { increment: 1 },
            },
        });
        expect(tx.bid.updateMany).toHaveBeenCalledWith({
            where: { auctionId: 'auction-1', status: BidStatus.ACTIVE },
            data: { status: BidStatus.OUTBID },
        });
    });

    it('rejects a concurrent bid when another transaction claims the auction version', async () => {
        const tx = {
            auction: {
                findUnique: jest.fn().mockResolvedValue(activeAuction),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.placeBid('bidder-2', 'auction-1', 120, 'bid-key-2'),
        ).rejects.toThrow(ConflictException);
    });

    it('selects the highest active bid after atomically claiming an expired auction', async () => {
        const winner = {
            id: 'bid-2',
            bidderId: 'bidder-2',
            amount: new Prisma.Decimal('130'),
            status: BidStatus.ACTIVE,
        };
        const tx = {
            auction: {
                findUnique: jest
                    .fn()
                    .mockResolvedValueOnce({
                        ...activeAuction,
                        endsAt: new Date(Date.now() - 1),
                    })
                    .mockResolvedValueOnce({
                        ...activeAuction,
                        status: AuctionStatus.SOLD,
                    }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                update: jest.fn(),
            },
            bid: {
                findFirst: jest.fn().mockResolvedValue(winner),
                update: jest.fn(),
            },
            outboxEvent: { create: jest.fn() },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await service.endAuction('auction-1');

        expect(tx.auction.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: 'auction-1',
                    status: AuctionStatus.ACTIVE,
                    endsAt: expect.objectContaining({ lte: expect.any(Date) }),
                }),
            }),
        );
        expect(tx.bid.update).toHaveBeenCalledWith({
            where: { id: 'bid-2' },
            data: { status: BidStatus.WON },
        });
    });

    it('does not query stock when creating an auction', async () => {
        const product = {
            id: 'product-1',
            sellerId: 'seller-1',
            type: ProductType.AUCTION,
            status: ProductStatus.DRAFT,
            isArchived: false,
        };
        const tx = {
            product: { findUnique: jest.fn().mockResolvedValue(product) },
            auction: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({
                    id: 'auction-1',
                    status: AuctionStatus.DRAFT,
                }),
            },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await service.createAuction('seller-1', {
            productId: 'product-1',
            startingPrice: 100,
            minBidIncrement: 10,
            startsAt: new Date(Date.now() + 1_000).toISOString(),
            endsAt: new Date(Date.now() + 60_000).toISOString(),
        });

        expect(tx.product.findUnique).toHaveBeenCalledWith({
            where: { id: 'product-1' },
        });
        expect(tx.product).not.toHaveProperty('updateMany');
    });

    it('accepts a last-second bid while the deadline is still in the future', async () => {
        const tx = {
            auction: {
                findUnique: jest.fn().mockResolvedValue({
                    ...activeAuction,
                    endsAt: new Date(Date.now() + 25),
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            bid: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                create: jest.fn().mockResolvedValue({
                    id: 'bid-last',
                    bidderId: 'bidder-1',
                    auctionId: 'auction-1',
                    amount: new Prisma.Decimal('110'),
                }),
            },
            outboxEvent: { create: jest.fn() },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.placeBid('bidder-1', 'auction-1', 110, 'bid-last-second'),
        ).resolves.toMatchObject({ id: 'bid-last' });
    });

    it('rejects a bid when endAuction already claimed the expired auction', async () => {
        const tx = {
            auction: {
                findUnique: jest.fn().mockResolvedValue({
                    ...activeAuction,
                    status: AuctionStatus.EXPIRED,
                    endsAt: new Date(Date.now() - 1),
                }),
            },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.placeBid('bidder-1', 'auction-1', 110, 'bid-after-end'),
        ).rejects.toThrow(BadRequestException);
    });

    it('rejects winner checkout after the checkout window expires', async () => {
        const tx = {
            payment: { findUnique: jest.fn().mockResolvedValue(null) },
            auction: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'auction-1',
                    status: AuctionStatus.SOLD,
                    winnerId: 'winner-1',
                    checkoutOrderId: null,
                    checkoutExpiresAt: new Date(Date.now() - 1_000),
                    currentPrice: new Prisma.Decimal('110'),
                    productId: 'product-1',
                    product: {
                        id: 'product-1',
                        sellerId: 'seller-1',
                        name: 'Lot',
                        type: ProductType.AUCTION,
                        status: ProductStatus.ACTIVE,
                        isArchived: false,
                    },
                }),
            },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.checkoutWinner('winner-1', 'auction-1', 'winner-checkout-1'),
        ).rejects.toThrow('Auction checkout window has expired');
    });

    it('rolls back winner checkout when expire claims the window first', async () => {
        const tx = {
            payment: { findUnique: jest.fn().mockResolvedValue(null) },
            auction: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'auction-1',
                    status: AuctionStatus.SOLD,
                    winnerId: 'winner-1',
                    checkoutOrderId: null,
                    checkoutExpiresAt: new Date(Date.now() + 60_000),
                    currentPrice: new Prisma.Decimal('110'),
                    productId: 'product-1',
                    product: {
                        id: 'product-1',
                        sellerId: 'seller-1',
                        name: 'Lot',
                        type: ProductType.AUCTION,
                        status: ProductStatus.ACTIVE,
                        isArchived: false,
                    },
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            product: { update: jest.fn() },
            order: {
                create: jest.fn().mockResolvedValue({
                    id: 'order-1',
                    userId: 'winner-1',
                    sellerOrders: [{ id: 'seller-order-1' }],
                }),
            },
            outboxEvent: { createMany: jest.fn() },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await expect(
            service.checkoutWinner('winner-1', 'auction-1', 'winner-checkout-2'),
        ).rejects.toThrow('Auction checkout window has expired');
        expect(tx.auction.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: 'auction-1',
                    status: AuctionStatus.SOLD,
                    winnerId: 'winner-1',
                    checkoutOrderId: null,
                }),
                data: { checkoutOrderId: 'order-1' },
            }),
        );
    });

    it('does not expire a winner window after checkout was claimed', async () => {
        const checkoutExpiresAt = new Date(Date.now() - 1_000);
        const tx = {
            auction: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'auction-1',
                    status: AuctionStatus.SOLD,
                    winnerId: 'winner-1',
                    checkoutExpiresAt,
                    checkoutOrderId: 'order-1',
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            outboxEvent: { create: jest.fn() },
        };
        prisma.$transaction.mockImplementation(
            (callback: (txContext: typeof tx) => unknown) => callback(tx),
        );

        await service.expireWinnerCheckout('auction-1');

        expect(tx.auction.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    checkoutOrderId: null,
                }),
            }),
        );
        expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    });
});
