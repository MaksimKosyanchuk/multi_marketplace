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
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuctionDto } from './dto/create-auction.dto';

const auctionDetails = {
    product: true,
    bids: { orderBy: { amount: 'desc' as const } },
};

@Injectable()
export class BiddingService {
    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('auctions') private readonly auctionsQueue: Queue,
    ) {}

    async createAuction(sellerId: string, dto: CreateAuctionDto) {
        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(dto.endsAt);
        if (endsAt <= startsAt || endsAt <= new Date()) {
            throw new BadRequestException(
                'Auction end must be after its start and in the future',
            );
        }

        const auction = await this.prisma.$transaction(async (tx) => {
            const product = await tx.product.findUnique({
                where: { id: dto.productId },
            });
            if (!product) throw new NotFoundException('Product not found');
            if (product.sellerId !== sellerId) {
                throw new ForbiddenException('You do not own this product');
            }
            if (
                product.type !== ProductType.AUCTION ||
                product.status !== ProductStatus.ACTIVE ||
                product.isArchived
            ) {
                throw new BadRequestException(
                    'Only an active auction product can be listed',
                );
            }
            if (product.stock < 1)
                throw new BadRequestException(
                    'Auction product is out of stock',
                );
            const existing = await tx.auction.findUnique({
                where: { productId: dto.productId },
            });
            if (existing)
                throw new ConflictException('Product already has an auction');

            return tx.auction.create({
                data: {
                    productId: dto.productId,
                    startingPrice: new Prisma.Decimal(dto.startingPrice),
                    currentPrice: new Prisma.Decimal(dto.startingPrice),
                    minBidIncrement: new Prisma.Decimal(dto.minBidIncrement),
                    startsAt,
                    endsAt,
                    status:
                        startsAt <= new Date()
                            ? AuctionStatus.ACTIVE
                            : AuctionStatus.DRAFT,
                },
                include: auctionDetails,
            });
        });
        await this.auctionsQueue.add(
            'end-auction',
            { auctionId: auction.id },
            {
                delay: Math.max(0, endsAt.getTime() - Date.now()),
                jobId: `auction-end:${auction.id}`,
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
                    jobId: `auction-start:${auction.id}`,
                    attempts: 5,
                    backoff: { type: 'exponential', delay: 1000 },
                },
            );
        }
        return auction;
    }

    async startAuction(auctionId: string) {
        return this.prisma.$transaction(async (tx) => {
            const auction = await tx.auction.findUnique({
                where: { id: auctionId },
            });
            if (
                !auction ||
                auction.status !== AuctionStatus.DRAFT ||
                auction.startsAt > new Date()
            )
                return auction;
            const product = await tx.product.findUnique({
                where: { id: auction.productId },
            });
            if (product?.status === ProductStatus.SOLD && product.stock === 0) {
                await tx.product.update({
                    where: { id: product.id },
                    data: {
                        stock: { increment: 1 },
                        status: ProductStatus.ACTIVE,
                        version: { increment: 1 },
                    },
                });
            }
            const result = await tx.auction.update({
                where: { id: auctionId },
                data: { status: AuctionStatus.ACTIVE },
                include: auctionDetails,
            });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Auction',
                    aggregateId: auctionId,
                    type: 'auction.started',
                    payload: { auctionId, correlationId: getCorrelationId() },
                    idempotencyKey: `auction-started:${auctionId}`,
                },
            });
            return result;
        });
    }

    findAuction(auctionId: string) {
        return this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: auctionDetails,
        });
    }

    async placeBid(
        bidderId: string,
        auctionId: string,
        amount: number,
        idempotencyKey: string,
    ) {
        if (!idempotencyKey?.trim())
            throw new BadRequestException('Idempotency-Key header is required');
        const existing = await this.prisma.bid.findUnique({
            where: { idempotencyKey },
        });
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
            const result = await this.prisma.$transaction(async (tx) => {
                const auction = await tx.auction.findUnique({
                    where: { id: auctionId },
                });
                if (!auction) throw new NotFoundException('Auction not found');
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
                    throw new BadRequestException(
                        `Bid must be at least ${minimum.toString()}`,
                    );
                }
                const updated = await tx.auction.updateMany({
                    where: {
                        id: auctionId,
                        status: AuctionStatus.ACTIVE,
                        version: auction.version,
                        currentPrice: auction.currentPrice,
                    },
                    data: {
                        currentPrice: bidAmount,
                        version: { increment: 1 },
                    },
                });
                if (!updated.count)
                    throw new ConflictException(
                        'Auction changed; retry the bid',
                    );
                await tx.bid.updateMany({
                    where: { auctionId, status: BidStatus.ACTIVE },
                    data: { status: BidStatus.OUTBID },
                });
                const bid = await tx.bid.create({
                    data: {
                        auctionId,
                        bidderId,
                        amount: bidAmount,
                        idempotencyKey,
                    },
                });
                await tx.outboxEvent.create({
                    data: {
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
                    },
                });
                return { bid, currentPrice: bidAmount };
            });
            return result.bid;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry = await this.prisma.bid.findUnique({
                    where: { idempotencyKey },
                });
                if (retry) return retry;
            }
            throw error;
        }
    }

    async endAuction(auctionId: string) {
        return this.prisma.$transaction(async (tx) => {
            const auction = await tx.auction.findUnique({
                where: { id: auctionId },
                include: {
                    bids: {
                        where: { status: BidStatus.ACTIVE },
                        orderBy: { amount: 'desc' },
                        take: 1,
                    },
                },
            });
            if (!auction || auction.status !== AuctionStatus.ACTIVE)
                return auction;
            const winner = auction.bids[0];
            if (new Date() < auction.endsAt) return auction;
            const status = winner ? AuctionStatus.SOLD : AuctionStatus.EXPIRED;
            const claimed = await tx.auction.updateMany({
                where: {
                    id: auctionId,
                    status: AuctionStatus.ACTIVE,
                    version: auction.version,
                    endsAt: { lte: new Date() },
                },
                data: {
                    status,
                    winnerId: winner?.bidderId,
                    checkoutExpiresAt: winner
                        ? new Date(Date.now() + 15 * 60 * 1000)
                        : null,
                },
            });
            if (!claimed.count)
                return tx.auction.findUnique({
                    where: { id: auctionId },
                    include: auctionDetails,
                });
            const result = await tx.auction.findUnique({
                where: { id: auctionId },
                include: auctionDetails,
            });
            if (winner)
                await tx.bid.update({
                    where: { id: winner.id },
                    data: { status: BidStatus.WON },
                });
            await tx.outboxEvent.create({
                data: {
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
                },
            });
            return result;
        });
    }

    async expireWinnerCheckout(auctionId: string) {
        return this.prisma.$transaction(async (tx) => {
            const auction = await tx.auction.findUnique({
                where: { id: auctionId },
            });
            if (
                !auction ||
                auction.status !== AuctionStatus.SOLD ||
                !auction.checkoutExpiresAt ||
                auction.checkoutExpiresAt > new Date()
            )
                return auction;
            const claimed = await tx.auction.updateMany({
                where: {
                    id: auctionId,
                    status: AuctionStatus.SOLD,
                    winnerId: auction.winnerId,
                    checkoutExpiresAt: auction.checkoutExpiresAt,
                },
                data: {
                    status: AuctionStatus.EXPIRED,
                    winnerId: null,
                    checkoutExpiresAt: null,
                    version: { increment: 1 },
                },
            });
            if (!claimed.count) return auction;
            const result = await tx.auction.findUnique({
                where: { id: auctionId },
            });
            await tx.outboxEvent.create({
                data: {
                    aggregateType: 'Auction',
                    aggregateId: auctionId,
                    type: 'auction.checkout-expired',
                    payload: { auctionId, correlationId: getCorrelationId() },
                    idempotencyKey: `auction-checkout-expired:${auctionId}`,
                },
            });
            return result;
        });
    }

    async checkoutWinner(
        winnerId: string,
        auctionId: string,
        idempotencyKey: string,
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException('Idempotency-Key header is required');
        }
        const existing = await this.prisma.payment.findUnique({
            where: { idempotencyKey },
            include: {
                order: {
                    include: { sellerOrders: { include: { items: true } } },
                },
            },
        });
        if (existing) {
            if (existing.order.userId !== winnerId) {
                throw new ForbiddenException(
                    'Idempotency key belongs to another user',
                );
            }
            return existing.order;
        }

        try {
            return await this.prisma.$transaction(async (tx) => {
                const auction = await tx.auction.findUnique({
                    where: { id: auctionId },
                    include: { product: true },
                });
                if (!auction) throw new NotFoundException('Auction not found');
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
                const stock = await tx.product.updateMany({
                    where: {
                        id: auction.productId,
                        stock: { gte: 1 },
                        status: ProductStatus.ACTIVE,
                        type: ProductType.AUCTION,
                        isArchived: false,
                    },
                    data: {
                        stock: { decrement: 1 },
                        status: ProductStatus.SOLD,
                        version: { increment: 1 },
                    },
                });
                if (!stock.count)
                    throw new BadRequestException(
                        'Auction product is no longer available',
                    );
                const commissionRate = new Prisma.Decimal('0.10');
                const commissionAmount =
                    auction.currentPrice.mul(commissionRate);
                const sellerEarnings =
                    auction.currentPrice.sub(commissionAmount);
                const order = await tx.order.create({
                    data: {
                        userId: winnerId,
                        status: OrderStatus.PAYMENT_PENDING,
                        subtotal: auction.currentPrice,
                        totalAmount: auction.currentPrice,
                        payments: {
                            create: {
                                provider: 'mock',
                                status: PaymentStatus.PENDING,
                                amount: auction.currentPrice,
                                idempotencyKey,
                            },
                        },
                        sellerOrders: {
                            create: {
                                sellerId: auction.product.sellerId,
                                status: SellerOrderStatus.PAYMENT_PENDING,
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
                    include: { sellerOrders: { include: { items: true } } },
                });
                await tx.outboxEvent.createMany({
                    data: [
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
                    ],
                });
                return order;
            });
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const retry = await this.prisma.payment.findUnique({
                    where: { idempotencyKey },
                    include: {
                        order: {
                            include: {
                                sellerOrders: { include: { items: true } },
                            },
                        },
                    },
                });
                if (retry?.order) return retry.order;
            }
            throw error;
        }
    }
}
