import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { SearchService } from './search.service';
import { OutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runWithCorrelationId } from '../common/correlation/correlation.context';
import { LoggerService } from '../logger/logger.service';
import { randomUUID } from 'node:crypto';

interface SearchJob {
    eventId: string;
    productId: string;
    action: 'index' | 'delete';
    correlationId?: string;
}

@Processor('search')
export class SearchProcessor extends WorkerHost {
    constructor(
        private readonly search: SearchService,
        private readonly redis: RedisService,
        private readonly prisma: PrismaService,
        private readonly logger: LoggerService,
    ) {
        super();
    }

    async process(job: Job<SearchJob>): Promise<void> {
        return runWithCorrelationId(job.data.correlationId ?? randomUUID(), () =>
            this.processJob(job),
        );
    }

    private async processJob(job: Job<SearchJob>): Promise<void> {
        void this.logger.debug(
            SearchProcessor.name,
            'Search queue processing',
            {
                jobId: job.id,
                eventId: job.data.eventId,
                productId: job.data.productId,
                attempts: job.attemptsMade + 1,
            },
        );
        const eventId = job.data.eventId;
        const claimed = await this.prisma.outboxEvent.updateMany({
            where: {
                id: eventId,
                aggregateType: { in: ['Product', 'Review'] },
                status: OutboxStatus.PENDING,
                availableAt: { lte: new Date() },
            },
            data: {
                status: OutboxStatus.PROCESSING,
                attempts: { increment: 1 },
                availableAt: new Date(Date.now() + 30_000),
            },
        });
        if (!claimed.count) return;
        try {
            const receipt = await this.prisma.eventConsumerReceipt.findUnique({
                where: {
                    eventId_consumerName: {
                        eventId,
                        consumerName: 'product-search',
                    },
                },
            });
            if (receipt) {
                await this.prisma.outboxEvent.update({
                    where: { id: eventId },
                    data: {
                        status: OutboxStatus.PROCESSED,
                        processedAt: new Date(),
                    },
                });
                return;
            }
            if (job.data.action === 'delete')
                await this.search.deleteProduct(job.data.productId);
            else await this.search.indexProduct(job.data.productId);
            await this.redis.setIfAbsent(
                `search:consumer:${job.id}`,
                '1',
                60 * 60 * 24 * 30,
            );
            await this.prisma.eventConsumerReceipt.create({
                data: { eventId, consumerName: 'product-search' },
            });
            await this.prisma.outboxEvent.update({
                where: { id: eventId },
                data: {
                    status: OutboxStatus.PROCESSED,
                    processedAt: new Date(),
                    lastError: null,
                },
            });
        } catch (error: unknown) {
            void this.logger.error(
                SearchProcessor.name,
                'Search queue processing failed',
                {
                    jobId: job.id,
                    eventId,
                    productId: job.data.productId,
                    attempts: job.attemptsMade + 1,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            );
            await this.prisma.outboxEvent.update({
                where: { id: eventId },
                data: {
                    status:
                        job.attemptsMade + 1 >= 5
                            ? OutboxStatus.FAILED
                            : OutboxStatus.PENDING,
                    availableAt: new Date(Date.now() + 1000),
                    lastError:
                        error instanceof Error
                            ? error.message
                            : 'Search consumer error',
                },
            });
            throw error;
        }
    }
}
