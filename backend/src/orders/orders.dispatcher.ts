import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';

const ORDER_OUTBOX_AGGREGATES = ['Order', 'SellerOrder', 'Payment'] as const;

@Injectable()
export class OrdersDispatcher implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('orders') private readonly ordersQueue: Queue,
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
                    aggregateType: { in: [...ORDER_OUTBOX_AGGREGATES] },
                    status: OutboxStatus.PROCESSING,
                    availableAt: { lte: now },
                    attempts: { lt: 5 },
                },
                data: { status: OutboxStatus.PENDING },
            });
            const events = await this.prisma.outboxEvent.findMany({
                where: {
                    aggregateType: { in: [...ORDER_OUTBOX_AGGREGATES] },
                    status: OutboxStatus.PENDING,
                    availableAt: { lte: new Date() },
                    attempts: { lt: 5 },
                },
                select: { id: true, payload: true },
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

                    return this.ordersQueue.add(
                        'deliver-outbox-event',
                        {
                            outboxEventId: event.id,
                            correlationId,
                        },
                        {
                            jobId: `outbox-${event.id}`,
                            attempts: 5,
                            backoff: { type: 'exponential', delay: 1000 },
                            removeOnComplete: true,
                            removeOnFail: true,
                        },
                    );
                }),
            );
            void this.logger.debug(
                OrdersDispatcher.name,
                'Outbox events dispatched',
                {
                    queue: 'orders',
                    eventCount: events.length,
                },
            );
        } catch (error: unknown) {
            void this.logger.error(
                OrdersDispatcher.name,
                'Outbox dispatch failed',
                {
                    queue: 'orders',
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
