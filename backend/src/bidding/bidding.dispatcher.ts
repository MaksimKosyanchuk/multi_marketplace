import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class BiddingDispatcher implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('auctions') private readonly auctionsQueue: Queue,
        private readonly logger: LoggerService,
    ) {}

    onModuleInit(): void {
        void this.dispatchPending();
        this.timer = setInterval(() => void this.dispatchPending(), 1000);
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }

    private async dispatchPending(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const now = new Date();
            await this.prisma.outboxEvent.updateMany({
                where: {
                    aggregateType: 'Auction',
                    status: OutboxStatus.PROCESSING,
                    availableAt: { lte: now },
                    attempts: { lt: 5 },
                },
                data: { status: OutboxStatus.PENDING },
            });
            const events = await this.prisma.outboxEvent.findMany({
                where: {
                    aggregateType: 'Auction',
                    status: OutboxStatus.PENDING,
                    availableAt: { lte: now },
                    attempts: { lt: 5 },
                },
                select: {
                    id: true,
                    type: true,
                    aggregateId: true,
                    payload: true,
                },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });
            await Promise.all(
                events.map((event) => {
                    const payload = event.payload as Record<
                        string,
                        unknown
                    > | null;
                    const rawCorrelationId = payload?.correlationId;
                    const correlationId =
                        typeof rawCorrelationId === 'string' ||
                        typeof rawCorrelationId === 'number'
                            ? String(rawCorrelationId)
                            : undefined;

                    const jobName =
                        event.type === 'auction.schedule-start'
                            ? 'start-auction'
                            : event.type === 'auction.schedule-end'
                              ? 'end-auction'
                              : event.type ===
                                  'auction.schedule-checkout-expiry'
                                ? 'expire-auction-checkout'
                                : 'deliver-auction-event';

                    return this.auctionsQueue.add(
                        jobName,
                        {
                            outboxEventId: event.id,
                            auctionId: event.aggregateId,
                            correlationId,
                        },
                        {
                            jobId: `auction-outbox-${event.id}`,
                            attempts: 5,
                            backoff: { type: 'exponential', delay: 1000 },
                            removeOnComplete: true,
                            removeOnFail: true,
                        },
                    );
                }),
            );
            this.logger.debug(
                BiddingDispatcher.name,
                'Auction events dispatched',
                {
                    queue: 'auctions',
                    eventCount: events.length,
                },
            );
        } catch (error: unknown) {
            this.logger.error(
                BiddingDispatcher.name,
                'Auction dispatch failed',
                {
                    queue: 'auctions',
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            throw error;
        } finally {
            this.running = false;
        }
    }
}
