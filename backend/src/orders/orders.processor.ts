import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from './orders.geteway';
import { RedisService } from '../redis/redis.service';

export interface OrderJobData {
    orderId: string;
}

export interface OutboxJobData {
    outboxEventId: string;
}

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
    private readonly logger = new Logger(OrdersProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ordersGateway: OrdersGateway,
        private readonly redis: RedisService,
    ) {
        super();
    }

    async process(job: Job<OrderJobData>): Promise<void> {
        if (job.name === 'deliver-outbox-event') {
            await this.processOutboxEvent(
                job,
                (job.data as unknown as OutboxJobData).outboxEventId,
            );
            return;
        }
        const { orderId } = job.data;
        this.logger.log(`Processing order ${orderId}...`);

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) {
            throw new Error(`Order ${orderId} was not found`);
        }

        this.logger.log(`Publishing current status for order ${orderId}`);

        this.ordersGateway.emitOrderStatusUpdate(
            order.userId,
            order.id,
            order.status,
        );
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
                    );
                    if (event.sellerOrder) {
                        this.ordersGateway.emitOrderStatusUpdate(
                            event.sellerOrder.sellerId,
                            event.order.id,
                            event.order.status,
                        );
                    }
                }
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
