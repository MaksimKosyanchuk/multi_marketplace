import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BiddingDispatcher implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('auctions') private readonly auctionsQueue: Queue,
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
                select: { id: true },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });
            await Promise.all(
                events.map((event) =>
                    this.auctionsQueue.add(
                        'deliver-auction-event',
                        { outboxEventId: event.id },
                        {
                            jobId: `auction-outbox:${event.id}`,
                            attempts: 5,
                            backoff: { type: 'exponential', delay: 1000 },
                            removeOnComplete: true,
                            removeOnFail: true,
                        },
                    ),
                ),
            );
        } finally {
            this.running = false;
        }
    }
}
