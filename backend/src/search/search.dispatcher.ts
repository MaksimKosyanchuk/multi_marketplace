import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class SearchDispatcher implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private running = false;
    constructor(
        private readonly prisma: PrismaService,
        @InjectQueue('search') private readonly queue: Queue,
        private readonly logger: LoggerService,
    ) {}
    onModuleInit(): void {
        void this.dispatch();
        this.timer = setInterval(() => void this.dispatch(), 1000);
    }
    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }
    private async dispatch() {
        if (this.running) return;
        this.running = true;
        try {
            const now = new Date();
            await this.prisma.outboxEvent.updateMany({
                where: {
                    aggregateType: { in: ['Product', 'Review'] },
                    status: OutboxStatus.PROCESSING,
                    availableAt: { lte: now },
                    attempts: { lt: 5 },
                },
                data: { status: OutboxStatus.PENDING },
            });
            const events = await this.prisma.outboxEvent.findMany({
                where: {
                    aggregateType: { in: ['Product', 'Review'] },
                    status: OutboxStatus.PENDING,
                    availableAt: { lte: now },
                    attempts: { lt: 5 },
                },
                select: {
                    id: true,
                    aggregateId: true,
                    type: true,
                    payload: true,
                },
                take: 50,
                orderBy: { createdAt: 'asc' },
            });
            await Promise.all(
                events.map((event) =>
                    this.queue.add(
                        'index-product',
                        {
                            eventId: event.id,
                            productId: event.aggregateId,
                            ...(event.type === 'review.created' &&
                            typeof event.payload === 'object' &&
                            event.payload !== null &&
                            'productId' in event.payload
                                ? { productId: String(event.payload.productId) }
                                : {}),
                            action:
                                event.type === 'product.archived'
                                    ? 'delete'
                                    : 'index',
                            correlationId:
                                typeof event.payload === 'object' &&
                                event.payload !== null &&
                                'correlationId' in event.payload
                                    ? String(event.payload.correlationId)
                                    : undefined,
                        },
                        {
                            jobId: `search-${event.id}`,
                            attempts: 5,
                            backoff: { type: 'exponential', delay: 1000 },
                            removeOnComplete: true,
                        },
                    ),
                ),
            );
            void this.logger.debug(SearchDispatcher.name, 'Search events dispatched', {
                queue: 'search',
                eventCount: events.length,
            });
        } catch (error: unknown) {
            void this.logger.error(SearchDispatcher.name, 'Search dispatch failed', {
                queue: 'search',
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        } finally {
            this.running = false;
        }
    }
}
