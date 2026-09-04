import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BiddingService } from './bidding.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BiddingGateway } from './bidding.gateway';
import { runWithCorrelationId } from '../common/correlation/correlation.context';
import { LoggerService } from '../logger/logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { randomUUID } from 'node:crypto';

interface AuctionJobData {
    auctionId: string;
    correlationId?: string;
    outboxEventId?: string;
}

@Processor('auctions')
export class BiddingProcessor extends WorkerHost {
    constructor(
        private readonly biddingService: BiddingService,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly gateway: BiddingGateway,
        private readonly logger: LoggerService,
        private readonly metrics: MetricsService,
    ) {
        super();
    }

    async process(job: Job<AuctionJobData>): Promise<void> {
        return runWithCorrelationId(
            job.data.correlationId ?? randomUUID(),
            () => this.processJob(job),
        );
    }

    private async processJob(job: Job<AuctionJobData>): Promise<void> {
        const started = Date.now();
        try {
            await this.runAuctionJob(job);
            this.metrics.recordQueueJob(Date.now() - started);
        } catch (error) {
            this.metrics.recordQueueJob(Date.now() - started, true);
            throw error;
        }
    }

    private async runAuctionJob(job: Job<AuctionJobData>): Promise<void> {
        void this.logger.debug(
            BiddingProcessor.name,
            'Auction queue job processing',
            {
                jobId: job.id,
                jobName: job.name,
                auctionId: job.data.auctionId,
                attempts: job.attemptsMade + 1,
            },
        );
        if (job.name === 'start-auction') {
            await this.runClaimedSchedule(job, async () => {
                const auction = await this.biddingService.startAuction(
                    job.data.auctionId,
                );
                return auction?.status === 'DRAFT';
            });
            return;
        }
        if (job.name === 'end-auction') {
            await this.runClaimedSchedule(job, async () => {
                const auction = await this.biddingService.endAuction(
                    job.data.auctionId,
                );
                return auction?.status === 'ACTIVE';
            });
            return;
        }
        if (job.name === 'expire-auction-checkout') {
            await this.runClaimedSchedule(job, async () => {
                const auction = await this.biddingService.expireWinnerCheckout(
                    job.data.auctionId,
                );
                return (
                    auction?.status === 'SOLD' &&
                    auction.checkoutOrderId == null &&
                    auction.checkoutExpiresAt != null &&
                    auction.checkoutExpiresAt > new Date()
                );
            });
            return;
        }
        if (job.name === 'deliver-auction-event') {
            if (!job.data.outboxEventId)
                throw new Error('Auction outbox event id is required');
            await this.deliverEvent(job.data.outboxEventId);
        }
    }

    private async runClaimedSchedule(
        job: Job<AuctionJobData>,
        execute: () => Promise<boolean>,
    ): Promise<void> {
        const outboxEventId = job.data.outboxEventId;
        if (!outboxEventId) {
            await execute();
            return;
        }
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
            const shouldRetry = await execute();
            if (shouldRetry) {
                await this.prisma.outboxEvent.update({
                    where: { id: outboxEventId },
                    data: {
                        status: 'PENDING',
                        availableAt: new Date(Date.now() + 30_000),
                    },
                });
                return;
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
                            : 'Unknown auction schedule error',
                },
            });
            throw error;
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
            const receipt = await this.prisma.eventConsumerReceipt.findUnique({
                where: {
                    eventId_consumerName: {
                        eventId: event.id,
                        consumerName: 'auction-websocket',
                    },
                },
            });
            if (receipt) {
                await this.prisma.outboxEvent.update({
                    where: { id: outboxEventId },
                    data: { status: 'PROCESSED', processedAt: new Date() },
                });
                return;
            }
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
                        event.id,
                    );
                }
                const eventPayload =
                    typeof event.payload === 'object' && event.payload !== null
                        ? (event.payload as Record<string, unknown>)
                        : {};
                this.gateway.emitAuctionEvent(
                    event.type,
                    eventPayload,
                    event.id,
                );
            }
            await this.prisma.eventConsumerReceipt.create({
                data: { eventId: event.id, consumerName: 'auction-websocket' },
            });
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
