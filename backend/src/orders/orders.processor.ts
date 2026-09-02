import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
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

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const updatedOrder = await this.prisma.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.PROCESSING },
        });

        this.logger.log(`Order ${orderId} moved to PROCESSING`);

        this.ordersGateway.emitOrderStatusUpdate(
            updatedOrder.userId,
            updatedOrder.id,
            updatedOrder.status,
        );
    }
}
