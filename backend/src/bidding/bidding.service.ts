import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
    AuctionStatus,
    BidStatus,
    LedgerEntryType,
    OrderStatus,
    PaymentStatus,
    Prisma,
    ProductStatus,
    ProductType,
    SellerOrderStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { getCorrelationId } from '../common/correlation/correlation.context';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { LoggerService } from '../logger/logger.service';
import {
    AuctionRepository,
    BidRepository,
    OrderRepository,
    OutboxRepository,
    ProductRepository,
    UnitOfWork,
} from '../database';

@Injectable()
export class BiddingService {
    constructor(
        private readonly unitOfWork: UnitOfWork,
        @InjectQueue('auctions') private readonly auctionsQueue: Queue,
        private readonly logger: LoggerService,
        private readonly auctionRepository: AuctionRepository,
        private readonly bidRepository: BidRepository,
        private readonly orderRepository: OrderRepository,
        private readonly outboxRepository: OutboxRepository,
        private readonly productRepository: ProductRepository,
    ) {}

    async createAuction(sellerId: string, dto: CreateAuctionDto) {
        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(dto.endsAt);
        if (endsAt <= startsAt || endsAt <= new Date()) {
            throw new BadRequestException(
                'Auction end must be after its start and in the future',
            );
        }

        const auction = await this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const product = await productRepository.findById(dto.productId);
                if (!product) throw new NotFoundException('Product not found');
                if (product.sellerId !== sellerId) {
                    throw new ForbiddenException('You do not own this product');
                }
                if (
                    product.type !== ProductType.AUCTION ||
                    (product.status !== ProductStatus.DRAFT &&
                        product.status !== ProductStatus.PENDING_APPROVAL &&
                        product.status !== ProductStatus.ACTIVE) ||
                    product.isArchived
                ) {
                    throw new BadRequestException(
                        'Only a draft, pending, or active auction product can be listed',
                    );
                }
                const existing = await auctionRepository.findByProductId(
                    dto.productId,
                );
                if (existing)
                    throw new ConflictException(
                        'Product already has an auction',
                    );

                return auctionRepository.create({
                    productId: dto.productId,
                    startingPrice: new Prisma.Decimal(dto.startingPrice),
                    currentPrice: new Prisma.Decimal(dto.startingPrice),
                    minBidIncrement: new Prisma.Decimal(dto.minBidIncrement),
                    startsAt,
                    endsAt,
                    status: AuctionStatus.DRAFT,
                });
            },
        );
        await this.auctionsQueue.add(
            'end-auction',
            { auctionId: auction.id },
            {
                delay: Math.max(0, endsAt.getTime() - Date.now()),
                jobId: `auction-end-${auction.id}`,
                attempts: 5,
                backoff: { type: 'exponential', delay: 1000 },
            },
        );
        if (auction.status === AuctionStatus.DRAFT) {
            await this.auctionsQueue.add(
                'start-auction',
                { auctionId: auction.id },
                {
                    delay: Math.max(0, startsAt.getTime() - Date.now()),
                    jobId: `auction-start-${auction.id}`,
                    attempts: 5,
                    backoff: { type: 'exponential', delay: 1000 },
                },
            );
        }
        void this.logger.audit(BiddingService.name, 'Auction created', {
            auctionId: auction.id,
            productId: dto.productId,
            sellerId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            startingPrice: dto.startingPrice,
            minBidIncrement: dto.minBidIncrement,
        });
        return auction;
    }

    async startAuction(auctionId: string) {
        return this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const auction = await auctionRepository.findById(auctionId);
                if (
                    !auction ||
                    auction.status !== AuctionStatus.DRAFT ||
                    auction.startsAt > new Date()
                )
                    return auction;
                const product = await productRepository.findById(
                    auction.productId,
                );
                if (product?.status !== ProductStatus.ACTIVE) {
                    return auction;
                }
                const result = await auctionRepository.activate(auctionId);
                await outboxRepository.create({
                    aggregateType: 'Auction',
                    aggregateId: auctionId,
                    type: 'auction.started',
                    payload: {
                        auctionId,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `auction-started:${auctionId}`,
                });
                await outboxRepository.create({
                    aggregateType: 'Product',
                    aggregateId: auction.productId,
                    type: 'product.auction-status-changed',
                    payload: {
                        productId: auction.productId,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `product-auction-status:${auctionId}:ACTIVE`,
                });
                void this.logger.audit(BiddingService.name, 'Auction started', {
                    auctionId,
                    productId: auction.productId,
                });
                return result;
            },
        );
    }

    async findAuction(auctionId: string) {
        const current =
            await this.auctionRepository.findByIdWithDetails(auctionId);
        if (
            current &&
            current.status === AuctionStatus.ACTIVE &&
            current.endsAt <= new Date()
        ) {
            return this.endAuction(auctionId);
        }
        return current;
    }

    findCreatedAuctions(sellerId: string) {
        return this.auctionRepository.listCreatedBySeller(sellerId);
    }

    findParticipatingAuctions(bidderId: string) {
        return this.auctionRepository.listParticipatingByBidder(bidderId);
    }

    async placeBid(
        bidderId: string,
        auctionId: string,
        amount: number,
        idempotencyKey: string,
    ) {
        if (!idempotencyKey?.trim())
            throw new BadRequestException('Idempotency-Key header is required');
        const existing =
            await this.bidRepository.findByIdempotencyKey(idempotencyKey);
        if (existing) {
            if (
                existing.bidderId !== bidderId ||
                existing.auctionId !== auctionId
            ) {
                throw new ForbiddenException(
                    'Idempotency key belongs to another bid',
                );
            }
            return existing;
        }

        try {
            const result = await this.unitOfWork.run(
                async ({
                    cartRepository,
                    orderRepository,
                    outboxRepository,
                    productRepository,
                    auctionRepository,
                    bidRepository,
                }) => {
                    const auction = await auctionRepository.findById(auctionId);
                    if (!auction)
                        throw new NotFoundException('Auction not found');
                    const now = new Date();
                    if (
                        auction.status !== AuctionStatus.ACTIVE ||
                        now < auction.startsAt ||
                        now >= auction.endsAt
                    ) {
                        throw new BadRequestException(
                            'Auction is not accepting bids',
                        );
                    }
                    const bidAmount = new Prisma.Decimal(amount);
                    const minimum = auction.currentPrice.add(
                        auction.minBidIncrement,
                    );
                    if (bidAmount.lt(minimum)) {
                        void this.logger.warn(
                            BiddingService.name,
                            'Bid rejected: below minimum',
                            {
                                auctionId,
                                bidderId,
                                amount,
                                minimum: minimum.toString(),
                            },
                        );
                        throw new BadRequestException(
                            `Bid must be at least ${minimum.toString()}`,
                        );
                    }
                    const updated = await bidRepository.claimAuctionVersion(
                        auctionId,
                        auction.version,
                        auction.currentPrice,
                        bidAmount,
                    );
                    if (!updated.count) {
                        void this.logger.warn(
                            BiddingService.name,
                            'Bid rejected: concurrent auction update',
                            {
                                auctionId,
                                bidderId,
                                amount,
                            },
                        );
                        throw new ConflictException(
                            'Auction changed; retry the bid',
                        );
                    }
                    await bidRepository.markActiveOutbid(auctionId);
                    const bid = await bidRepository.create({
                        auctionId,
                        bidderId,
                        amount: bidAmount,
                        idempotencyKey,
                    });
                    await outboxRepository.create({
                        aggregateType: 'Auction',
                        aggregateId: auctionId,
                        type: 'auction.bid-placed',
                        payload: {
                            auctionId,
                            bidderId,
                            amount: bidAmount.toString(),
                            correlationId: getCorrelationId(),
                        },
                        idempotencyKey: `${idempotencyKey}:event`,
                    });
                    return { bid, currentPrice: bidAmount };
                },
            );
            void this.logger.audit(BiddingService.name, 'Bid accepted', {
                auctionId,
                bidderId,
                bidId: result.bid.id,
                amount: result.bid.amount.toString(),
            });
            return result.bid;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry =
                    await this.bidRepository.findByIdempotencyKey(
                        idempotencyKey,
                    );
                if (retry) return retry;
            }
            throw error;
        }
    }

    async endAuction(auctionId: string) {
        return this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const auction = await auctionRepository.findById(auctionId);
                if (!auction || auction.status !== AuctionStatus.ACTIVE)
                    return auction;
                if (new Date() < auction.endsAt) return auction;
                const claimed = await auctionRepository.claimExpired(auctionId);
                if (!claimed.count)
                    return auctionRepository.findByIdWithDetails(auctionId);
                const winner = await bidRepository.findHighestActive(auctionId);
                const status = winner
                    ? AuctionStatus.SOLD
                    : AuctionStatus.EXPIRED;
                const result = await auctionRepository.markEnded(
                    auctionId,
                    winner?.bidderId ?? null,
                    status,
                );
                if (winner) await bidRepository.markWon(winner.id);
                void this.logger.audit(BiddingService.name, 'Auction ended', {
                    auctionId,
                    status,
                    winnerId: winner?.bidderId ?? null,
                    winningBidId: winner?.id ?? null,
                });
                await outboxRepository.create({
                    aggregateType: 'Auction',
                    aggregateId: auctionId,
                    type: 'auction.ended',
                    payload: {
                        auctionId,
                        status,
                        winnerId: winner?.bidderId ?? null,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `auction-ended:${auctionId}`,
                });
                return result;
            },
        );
    }

    async expireWinnerCheckout(auctionId: string) {
        return this.unitOfWork.run(
            async ({
                cartRepository,
                orderRepository,
                outboxRepository,
                productRepository,
                auctionRepository,
                bidRepository,
            }) => {
                const auction = await auctionRepository.findById(auctionId);
                if (
                    !auction ||
                    auction.status !== AuctionStatus.SOLD ||
                    !auction.checkoutExpiresAt ||
                    auction.checkoutExpiresAt > new Date()
                )
                    return auction;
                const claimed = await auctionRepository.claimCheckoutExpiry(
                    auctionId,
                    auction.winnerId,
                    auction.checkoutExpiresAt,
                );
                if (!claimed.count) return auction;
                const result = await auctionRepository.findById(auctionId);
                await outboxRepository.create({
                    aggregateType: 'Auction',
                    aggregateId: auctionId,
                    type: 'auction.checkout-expired',
                    payload: {
                        auctionId,
                        correlationId: getCorrelationId(),
                    },
                    idempotencyKey: `auction-checkout-expired:${auctionId}`,
                });
                void this.logger.audit(
                    BiddingService.name,
                    'Auction winner checkout expired',
                    {
                        auctionId,
                        winnerId: auction.winnerId,
                    },
                );
                return result;
            },
        );
    }

    async checkoutWinner(
        winnerId: string,
        auctionId: string,
        idempotencyKey: string,
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }
        const existing =
            await this.orderRepository.findPaymentWithSellerOrderItems(
                idempotencyKey,
            );
        if (existing) {
            if (existing.order.userId !== winnerId) {
                throw new ForbiddenException(
                    'Idempotency key belongs to another user',
                );
            }
            return existing.order;
        }

        try {
            return await this.unitOfWork.run(
                async ({
                    cartRepository,
                    orderRepository,
                    outboxRepository,
                    productRepository,
                    auctionRepository,
                    bidRepository,
                }) => {
                    const auction =
                        await auctionRepository.findByIdWithProduct(auctionId);
                    if (!auction)
                        throw new NotFoundException('Auction not found');
                    if (auction.checkoutOrderId) {
                        const paidOrder =
                            await orderRepository.findByIdWithSellerOrderItems(
                                auction.checkoutOrderId,
                            );
                        if (paidOrder?.userId === winnerId) return paidOrder;
                        throw new ForbiddenException(
                            'Auction checkout belongs to another user',
                        );
                    }
                    if (
                        auction.status !== AuctionStatus.SOLD ||
                        auction.winnerId !== winnerId
                    ) {
                        throw new ForbiddenException(
                            'Only the auction winner can checkout',
                        );
                    }
                    if (
                        !auction.checkoutExpiresAt ||
                        auction.checkoutExpiresAt <= new Date()
                    ) {
                        throw new BadRequestException(
                            'Auction checkout window has expired',
                        );
                    }
                    if (
                        auction.product.type !== ProductType.AUCTION ||
                        auction.product.isArchived ||
                        auction.product.status !== ProductStatus.ACTIVE
                    ) {
                        throw new BadRequestException(
                            'Auction product is no longer available',
                        );
                    }
                    await productRepository.update(auction.productId, {
                        status: ProductStatus.SOLD,
                        version: { increment: 1 },
                    });
                    const commissionRate = new Prisma.Decimal('0.10');
                    const commissionAmount =
                        auction.currentPrice.mul(commissionRate);
                    const sellerEarnings =
                        auction.currentPrice.sub(commissionAmount);
                    const order = await orderRepository.create(
                        {
                            userId: winnerId,
                            status: OrderStatus.PROCESSING,
                            subtotal: auction.currentPrice,
                            totalAmount: auction.currentPrice,
                            payments: {
                                create: {
                                    provider: 'mock',
                                    status: PaymentStatus.PAID,
                                    amount: auction.currentPrice,
                                    idempotencyKey,
                                },
                            },
                            sellerOrders: {
                                create: {
                                    sellerId: auction.product.sellerId,
                                    status: SellerOrderStatus.PROCESSING,
                                    subtotal: auction.currentPrice,
                                    commissionRate,
                                    commissionAmount,
                                    sellerEarnings,
                                    items: {
                                        create: {
                                            productId: auction.productId,
                                            productName: auction.product.name,
                                            quantity: 1,
                                            unitPrice: auction.currentPrice,
                                            totalAmount: auction.currentPrice,
                                        },
                                    },
                                    ledgerEntries: {
                                        create: [
                                            {
                                                type: LedgerEntryType.PLATFORM_COMMISSION,
                                                amount: commissionAmount,
                                                idempotencyKey: `${idempotencyKey}:commission`,
                                            },
                                            {
                                                type: LedgerEntryType.SELLER_EARNING,
                                                amount: sellerEarnings,
                                                idempotencyKey: `${idempotencyKey}:earning`,
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                        { sellerOrders: { include: { items: true } } },
                    );
                    await auctionRepository.updateCheckoutOrder(
                        auctionId,
                        order.id,
                    );
                    void this.logger.audit(
                        BiddingService.name,
                        'Auction winner checkout created',
                        {
                            auctionId,
                            orderId: order.id,
                            winnerId,
                            amount: auction.currentPrice.toString(),
                        },
                    );
                    await outboxRepository.createMany([
                        {
                            orderId: order.id,
                            aggregateType: 'Order',
                            aggregateId: order.id,
                            type: 'order.created',
                            payload: {
                                userId: winnerId,
                                auctionId,
                                correlationId: getCorrelationId(),
                            },
                            idempotencyKey: `${idempotencyKey}:order-created`,
                        },
                        {
                            orderId: order.id,
                            sellerOrderId: order.sellerOrders[0].id,
                            aggregateType: 'Auction',
                            aggregateId: auctionId,
                            type: 'auction.checkout-created',
                            payload: {
                                auctionId,
                                orderId: order.id,
                                winnerId,
                                correlationId: getCorrelationId(),
                            },
                            idempotencyKey: `${idempotencyKey}:auction-checkout`,
                        },
                    ]);
                    return order;
                },
            );
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry =
                    await this.orderRepository.findPaymentWithSellerOrderItems(
                        idempotencyKey,
                    );
                if (retry?.order) return retry.order;
            }
            throw error;
        }
    }
}
