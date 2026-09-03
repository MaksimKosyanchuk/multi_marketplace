import { Inject, Injectable } from '@nestjs/common';
import { AuctionStatus, BidStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DatabaseClient } from './database.types';

const auctionDetails = {
    product: true,
    bids: { orderBy: { amount: 'desc' as const } },
};

@Injectable()
export class AuctionRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findById(id: string, db: DatabaseClient = this.prisma) {
        return db.auction.findUnique({ where: { id } });
    }

    findByIdWithDetails(id: string, db: DatabaseClient = this.prisma) {
        return db.auction.findUnique({
            where: { id },
            include: auctionDetails,
        });
    }

    findByIdWithProduct(id: string, db: DatabaseClient = this.prisma) {
        return db.auction.findUnique({
            where: { id },
            include: { product: true },
        });
    }

    updateCheckoutOrder(
        auctionId: string,
        checkoutOrderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.auction.update({
            where: { id: auctionId },
            data: { checkoutOrderId },
        });
    }

    /** Atomically claims the winner checkout window before binding an order. */
    claimWinnerCheckout(
        auctionId: string,
        winnerId: string,
        checkoutOrderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.auction.updateMany({
            where: {
                id: auctionId,
                status: AuctionStatus.SOLD,
                winnerId,
                checkoutOrderId: null,
                checkoutExpiresAt: { gt: new Date() },
            },
            data: { checkoutOrderId },
        });
    }

    findByProductId(productId: string, db: DatabaseClient = this.prisma) {
        return db.auction.findUnique({ where: { productId } });
    }

    create(
        data: Prisma.AuctionCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.auction.create({ data, include: auctionDetails });
    }

    activate(id: string, db: DatabaseClient = this.prisma) {
        return db.auction.update({
            where: { id },
            data: { status: AuctionStatus.ACTIVE },
            include: auctionDetails,
        });
    }

    cancelForProduct(productId: string, db: DatabaseClient = this.prisma) {
        return db.auction.updateMany({
            where: {
                productId,
                status: { in: [AuctionStatus.DRAFT, AuctionStatus.ACTIVE] },
            },
            data: { status: AuctionStatus.CANCELLED },
        });
    }

    activateDraftIfStarted(id: string, db: DatabaseClient = this.prisma) {
        return db.auction.updateMany({
            where: {
                id,
                status: AuctionStatus.DRAFT,
                startsAt: { lte: new Date() },
            },
            data: { status: AuctionStatus.ACTIVE },
        });
    }

    claimExpired(id: string, db: DatabaseClient = this.prisma) {
        return db.auction.updateMany({
            where: {
                id,
                status: AuctionStatus.ACTIVE,
                endsAt: { lte: new Date() },
            },
            data: {
                status: AuctionStatus.EXPIRED,
                winnerId: null,
                checkoutExpiresAt: null,
            },
        });
    }

    markEnded(
        id: string,
        winnerId: string | null,
        status: AuctionStatus,
        db: DatabaseClient = this.prisma,
    ) {
        return db.auction.update({
            where: { id },
            data: {
                status,
                winnerId,
                checkoutExpiresAt: winnerId
                    ? new Date(Date.now() + 15 * 60 * 1000)
                    : null,
                version: { increment: 1 },
            },
            include: auctionDetails,
        });
    }

    claimCheckoutExpiry(
        id: string,
        winnerId: string | null,
        checkoutExpiresAt: Date,
        db: DatabaseClient = this.prisma,
    ) {
        return db.auction.updateMany({
            where: {
                id,
                status: AuctionStatus.SOLD,
                winnerId,
                checkoutExpiresAt,
                checkoutOrderId: null,
            },
            data: {
                status: AuctionStatus.EXPIRED,
                winnerId: null,
                checkoutExpiresAt: null,
                version: { increment: 1 },
            },
        });
    }

    listCreatedBySeller(sellerId: string, db: DatabaseClient = this.prisma) {
        return db.auction.findMany({
            where: { product: { sellerId } },
            include: auctionDetails,
            orderBy: { createdAt: 'desc' },
        });
    }

    listParticipatingByBidder(
        bidderId: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.auction.findMany({
            where: { bids: { some: { bidderId } } },
            include: auctionDetails,
            orderBy: { createdAt: 'desc' },
        });
    }
}

@Injectable()
export class BidRepository {
    constructor(
        @Inject(PrismaService) private readonly prisma: DatabaseClient,
    ) {}

    findByIdempotencyKey(
        idempotencyKey: string,
        db: DatabaseClient = this.prisma,
    ) {
        return db.bid.findUnique({ where: { idempotencyKey } });
    }

    findHighestActive(auctionId: string, db: DatabaseClient = this.prisma) {
        return db.bid.findFirst({
            where: { auctionId, status: BidStatus.ACTIVE },
            orderBy: { amount: 'desc' },
        });
    }

    claimAuctionVersion(
        auctionId: string,
        version: number,
        currentPrice: Prisma.Decimal,
        amount: Prisma.Decimal,
        db: DatabaseClient = this.prisma,
    ) {
        return db.auction.updateMany({
            where: {
                id: auctionId,
                status: AuctionStatus.ACTIVE,
                version,
                currentPrice,
            },
            data: { currentPrice: amount, version: { increment: 1 } },
        });
    }

    markActiveOutbid(auctionId: string, db: DatabaseClient = this.prisma) {
        return db.bid.updateMany({
            where: { auctionId, status: BidStatus.ACTIVE },
            data: { status: BidStatus.OUTBID },
        });
    }

    create(
        data: Prisma.BidCreateArgs['data'],
        db: DatabaseClient = this.prisma,
    ) {
        return db.bid.create({ data });
    }

    markWon(id: string, db: DatabaseClient = this.prisma) {
        return db.bid.update({
            where: { id },
            data: { status: BidStatus.WON },
        });
    }
}
