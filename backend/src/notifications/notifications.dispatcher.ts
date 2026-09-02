import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsDispatcher implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('notifications') private readonly queue: Queue,
    ) {}

    onModuleInit(): void {
        void this.dispatch();
        this.timer = setInterval(() => void this.dispatch(), 1000);
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }

    private async dispatch(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const events = await this.prisma.outboxEvent.findMany({
                where: {
                    availableAt: { lte: new Date() },
                    attempts: { lt: 5 },
                    type: { not: 'product.stock-changed' },
                    consumerReceipts: {
                        none: { consumerName: 'notifications' },
                    },
                },
                select: { id: true, payload: true },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });
            await Promise.all(
                events.map((event) => {
                    const payload =
                        typeof event.payload === 'object' && event.payload !== null
                            ? (event.payload as Record<string, unknown>)
                            : {};
                    return this.queue.add(
                        'deliver-notification',
                        {
                            outboxEventId: event.id,
                            correlationId:
                                typeof payload.correlationId === 'string'
                                    ? payload.correlationId
                                    : undefined,
                        },
                        {
                            jobId: `notification:${event.id}`,
                            attempts: 5,
                            backoff: { type: 'exponential', delay: 1000 },
                            removeOnComplete: true,
                        },
                    );
                }),
            );
        } finally {
            this.running = false;
        }
    }
}
