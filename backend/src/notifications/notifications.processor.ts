import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { runWithCorrelationId } from '../common/correlation/correlation.context';
import { LoggerService } from '../logger/logger.service';
import { randomUUID } from 'node:crypto';

interface NotificationJob {
    outboxEventId: string;
    correlationId?: string;
}

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
        private readonly logger: LoggerService,
    ) {
        super();
    }

    async process(job: Job<NotificationJob>): Promise<void> {
        const correlationId = job.data.correlationId;
        return runWithCorrelationId(correlationId ?? randomUUID(), () =>
            this.processNotification(job),
        );
    }

    private async processNotification(
        job: Job<NotificationJob>,
    ): Promise<void> {
        void this.logger.debug(
            NotificationsProcessor.name,
            'Notification queue processing',
            {
                jobId: job.id,
                outboxEventId: job.data.outboxEventId,
                attempts: job.attemptsMade + 1,
            },
        );
        const event = await this.prisma.outboxEvent.findUnique({
            where: { id: job.data.outboxEventId },
            include: {
                order: { select: { userId: true } },
                sellerOrder: { select: { sellerId: true } },
            },
        });
        if (!event)
            throw new Error(`Outbox event ${job.data.outboxEventId} not found`);
        const receipt = await this.prisma.eventConsumerReceipt.findUnique({
            where: {
                eventId_consumerName: {
                    eventId: event.id,
                    consumerName: 'notifications',
                },
            },
        });
        if (receipt?.completedAt) return;
        const receiptLease = new Date(Date.now() + 30_000);
        const claimed = await this.prisma.eventConsumerReceipt.upsert({
            where: {
                eventId_consumerName: {
                    eventId: event.id,
                    consumerName: 'notifications',
                },
            },
            create: {
                eventId: event.id,
                consumerName: 'notifications',
                attempts: 0,
            },
            update: {},
        });
        if (claimed.completedAt) {
            return;
        }
        const leaseClaimed = await this.prisma.eventConsumerReceipt.updateMany({
            where: {
                id: claimed.id,
                completedAt: null,
                OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
            },
            data: {
                attempts: { increment: 1 },
                leaseUntil: receiptLease,
            },
        });
        if (!leaseClaimed.count) return;

        const payload =
            typeof event.payload === 'object' && event.payload !== null
                ? (event.payload as Record<string, unknown>)
                : {};
        const targets = new Set<string>();
        if (event.order?.userId) targets.add(event.order.userId);
        if (event.sellerOrder?.sellerId)
            targets.add(event.sellerOrder.sellerId);
        for (const key of ['userId', 'customerId', 'sellerId']) {
            if (typeof payload[key] === 'string') targets.add(payload[key]);
        }
        try {
            for (const userId of targets) {
                await this.prisma.notification.upsert({
                    where: { userId_eventId: { userId, eventId: event.id } },
                    create: {
                        userId,
                        eventId: event.id,
                        type: event.type,
                        payload: {
                            ...payload,
                            correlationId: job.data.correlationId,
                        },
                    },
                    update: {},
                });
                this.notifications.notifyUser(userId, event.type, {
                    eventId: event.id,
                    ...payload,
                    correlationId: job.data.correlationId,
                });
            }
            await this.prisma.eventConsumerReceipt.update({
                where: { id: claimed.id },
                data: {
                    completedAt: new Date(),
                    leaseUntil: null,
                    lastError: null,
                },
            });
        } catch (error: unknown) {
            void this.logger.error(
                NotificationsProcessor.name,
                'Notification processing failed',
                {
                    jobId: job.id,
                    outboxEventId: event.id,
                    attempts: job.attemptsMade + 1,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            await this.prisma.eventConsumerReceipt.update({
                where: { id: claimed.id },
                data: {
                    leaseUntil: new Date(),
                    lastError:
                        error instanceof Error
                            ? error.message
                            : 'Notification delivery failed',
                },
            });
            throw error;
        }
    }
}
