import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from './orders.geteway';
import { RedisService } from '../redis/redis.service';
import { runWithCorrelationId } from '../common/correlation/correlation.context';
import { LoggerService } from '../logger/logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { randomUUID } from 'node:crypto';

export interface OrderJobData {
    orderId: string;
}

export interface OutboxJobData {
    outboxEventId: string;
    correlationId?: string;
}

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ordersGateway: OrdersGateway,
        private readonly redis: RedisService,
        private readonly logger: LoggerService,
        private readonly metrics: MetricsService,
    ) {
        super();
    }

    async process(job: Job<OrderJobData>): Promise<void> {
        const correlationId = (job.data as unknown as OutboxJobData)
            .correlationId;
        return runWithCorrelationId(correlationId ?? randomUUID(), () =>
            this.processJob(job),
        );
    }

    private async processJob(job: Job<OrderJobData>): Promise<void> {
        const started = Date.now();
        try {
            if (job.name === 'deliver-outbox-event') {
                const outboxJob = job.data as unknown as OutboxJobData;
                void this.logger.debug(
                    OrdersProcessor.name,
                    'Queue outbox event processing',
                    {
                        jobId: job.id,
                        outboxEventId: outboxJob.outboxEventId,
                        attempts: job.attemptsMade + 1,
                    },
                );
                await this.processOutboxEvent(job, outboxJob.outboxEventId);
                this.metrics.recordQueueJob(Date.now() - started);
                return;
            }
            const { orderId } = job.data;
            void this.logger.log(
                OrdersProcessor.name,
                'Queue order processing',
                {
                    orderId,
                    jobId: job.id,
                    attempts: job.attemptsMade + 1,
                },
            );

            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
            });
            if (!order) {
                throw new Error(`Order ${orderId} was not found`);
            }

            void this.logger.audit(
                OrdersProcessor.name,
                'Order status published',
                {
                    orderId,
                    userId: order.userId,
                    status: order.status,
                    jobId: job.id,
                },
            );

            this.ordersGateway.emitOrderStatusUpdate(
                order.userId,
                order.id,
                order.status,
            );
            this.metrics.recordQueueJob(Date.now() - started);
        } catch (error) {
            this.metrics.recordQueueJob(Date.now() - started, true);
            throw error;
        }
    }

    private async processOutboxEvent(
        job: Job<OrderJobData>,
        outboxEventId: string,
    ): Promise<void> {
        const claimed = await this.prisma.outboxEvent.updateMany({
            where: {
                id: outboxEventId,
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
                include: {
                    order: { select: { id: true, userId: true, status: true } },
                    sellerOrder: { select: { sellerId: true } },
                },
            });
            if (!event)
                throw new Error(`Outbox event ${outboxEventId} was not found`);
            const receipt = await this.prisma.eventConsumerReceipt.findUnique({
                where: {
                    eventId_consumerName: {
                        eventId: event.id,
                        consumerName: 'orders-websocket',
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
            if (event.type === 'product.stock-changed') {
                const payload = event.payload as {
                    productId?: string;
                    quantity?: number;
                };
                if (!payload.productId || payload.quantity === undefined) {
                    throw new Error(`Invalid stock event ${outboxEventId}`);
                }
                const firstDelivery = await this.redis.setIfAbsent(
                    `outbox:delivered:${event.id}`,
                    '1',
                    60 * 60 * 24 * 30,
                );
                if (firstDelivery) {
                    this.ordersGateway.emitStockUpdate(
                        payload.productId,
                        payload.quantity,
                        event.id,
                    );
                }
            }
            if (event.order) {
                const firstDelivery = await this.redis.setIfAbsent(
                    `outbox:delivered:${event.id}:order`,
                    '1',
                    60 * 60 * 24 * 30,
                );
                if (firstDelivery) {
                    this.ordersGateway.emitOrderStatusUpdate(
                        event.order.userId,
                        event.order.id,
                        event.order.status,
                        event.id,
                    );
                    if (event.sellerOrder) {
                        this.ordersGateway.emitOrderStatusUpdate(
                            event.sellerOrder.sellerId,
                            event.order.id,
                            event.order.status,
                            event.id,
                        );
                    }
                }
            }
            await this.prisma.eventConsumerReceipt.create({
                data: { eventId: event.id, consumerName: 'orders-websocket' },
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
            void this.logger.error(
                OrdersProcessor.name,
                'Queue outbox processing failed',
                {
                    outboxEventId,
                    jobId: job.id,
                    attempts: job.attemptsMade + 1,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            await this.prisma.outboxEvent.update({
                where: { id: outboxEventId },
                data: {
                    status: job.attemptsMade + 1 >= 5 ? 'FAILED' : 'PENDING',
                    availableAt: new Date(Date.now() + 1000),
                    lastError:
                        error instanceof Error
                            ? error.message
                            : 'Unknown outbox error',
                },
            });
            throw error;
        }
    }
}
