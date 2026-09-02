import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from './orders.geteway';

export interface OrderJobData {
    orderId: string;
}

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
    private readonly logger = new Logger(OrdersProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ordersGateway: OrdersGateway,
    ) {
        super();
    }

    async process(job: Job<OrderJobData>): Promise<void> {
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
}
