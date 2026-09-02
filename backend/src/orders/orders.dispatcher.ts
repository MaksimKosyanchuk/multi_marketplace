import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersDispatcher implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('orders') private readonly ordersQueue: Queue,
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
                    status: OutboxStatus.PROCESSING,
                    availableAt: { lte: now },
                    attempts: { lt: 5 },
                },
                data: { status: OutboxStatus.PENDING },
            });
            const events = await this.prisma.outboxEvent.findMany({
                where: {
                    aggregateType: { in: ['Order', 'SellerOrder', 'Payment'] },
                    status: OutboxStatus.PENDING,
                    availableAt: { lte: new Date() },
                    attempts: { lt: 5 },
                },
                select: { id: true, payload: true },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });
            await Promise.all(
                events.map((event) =>
                    this.ordersQueue.add(
                        'deliver-outbox-event',
                        {
                            outboxEventId: event.id,
                            correlationId:
                                typeof event.payload === 'object' &&
                                event.payload !== null &&
                                'correlationId' in event.payload
                                    ? String(event.payload.correlationId)
                                    : undefined,
                        },
                        {
                            jobId: `outbox:${event.id}`,
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
