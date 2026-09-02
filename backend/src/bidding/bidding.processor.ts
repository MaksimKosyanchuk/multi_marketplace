import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { BiddingService } from './bidding.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BiddingGateway } from './bidding.gateway';

interface AuctionJobData {
    auctionId: string;
}

@Processor('auctions')
export class BiddingProcessor extends WorkerHost {
    constructor(
        private readonly biddingService: BiddingService,
        @InjectQueue('auctions') private readonly auctionsQueue: Queue,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly gateway: BiddingGateway,
    ) {
        super();
    }

    async process(job: Job<AuctionJobData>): Promise<void> {
        if (job.name === 'start-auction') {
            await this.biddingService.startAuction(job.data.auctionId);
            return;
        }
        if (job.name === 'end-auction') {
            const auction = await this.biddingService.endAuction(
                job.data.auctionId,
            );
            if (auction?.status === 'SOLD' && auction.checkoutExpiresAt) {
                await this.auctionsQueue.add(
                    'expire-auction-checkout',
                    { auctionId: auction.id },
                    {
                        delay: Math.max(
                            0,
                            auction.checkoutExpiresAt.getTime() - Date.now(),
                        ),
                        jobId: `auction-checkout-expiry:${auction.id}`,
                        attempts: 5,
                        backoff: { type: 'exponential', delay: 1000 },
                    },
                );
            }
            return;
        }
        if (job.name === 'expire-auction-checkout') {
            await this.biddingService.expireWinnerCheckout(job.data.auctionId);
            return;
        }
        if (job.name === 'deliver-auction-event') {
            await this.deliverEvent(job.data.outboxEventId);
        }
    }

    private async deliverEvent(outboxEventId: string): Promise<void> {
        const claimed = await this.prisma.outboxEvent.updateMany({
            where: {
                id: outboxEventId,
                aggregateType: 'Auction',
                status: 'PENDING',
                availableAt: { lte: new Date() },
            },
            data: {
                status: 'PROCESSING',
                attempts: { increment: 1 },
                availableAt: new Date(Date.now() + 30_000),
            },
        });
        if (!claimed.count) return;
        try {
            const event = await this.prisma.outboxEvent.findUnique({
                where: { id: outboxEventId },
            });
            if (!event)
                throw new Error(`Auction event ${outboxEventId} was not found`);
            const firstDelivery = await this.redis.setIfAbsent(
                `outbox:delivered:${event.id}`,
                '1',
                60 * 60 * 24 * 30,
            );
            if (firstDelivery) {
                const payload = event.payload as {
                    auctionId?: string;
                    currentPrice?: string;
                    bidderId?: string;
                    amount?: string;
                };
                if (event.type === 'auction.bid-placed') {
                    this.gateway.emitBidUpdate(
                        payload.auctionId ?? event.aggregateId,
                        payload.currentPrice ?? payload.amount ?? '0',
                        payload.bidderId ?? '',
                    );
                }
                this.gateway.emitAuctionEvent(event.type, event.payload);
            }
            await this.prisma.outboxEvent.update({
                where: { id: outboxEventId },
                data: {
                    status: 'PROCESSED',
                    processedAt: new Date(),
                    lastError: null,
                },
            });
        } catch (error: unknown) {
            await this.prisma.outboxEvent.update({
                where: { id: outboxEventId },
                data: {
                    status: 'PENDING',
                    availableAt: new Date(Date.now() + 1000),
                    lastError:
                        error instanceof Error
                            ? error.message
                            : 'Unknown auction event error',
                },
            });
            throw error;
        }
    }
}
