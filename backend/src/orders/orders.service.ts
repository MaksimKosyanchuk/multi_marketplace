import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { QueryOrderDto } from './dto/query-order.dto';
import { LoggerService } from '../logger/logger.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        @InjectQueue('orders') private ordersQueue: Queue,
        private logger: LoggerService,
        private redis: RedisService,
    ) {}

    async checkout(userId: string) {
        const cart = await this.prisma.cart.findUnique({ where: { userId } });
        if (!cart) throw new BadRequestException('Cart is empty');

        const items = await this.prisma.cartItem.findMany({
            where: { cartId: cart.id },
            include: { product: true },
        });

        if (items.length === 0) {
            throw new BadRequestException('Cart is empty');
        }

        const order = await this.prisma.$transaction(async (tx) => {
            let totalAmount = new Prisma.Decimal(0);
            const orderItemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

            for (const item of items) {
                const result = await tx.product.updateMany({
                    where: {
                        id: item.productId,
                        stock: { gte: item.quantity },
                    },
                    data: { stock: { decrement: item.quantity } },
                });

                if (result.count === 0) {
                    throw new BadRequestException(
                        `Insufficient stock for product "${item.product.name}"`,
                    );
                }

                const lineTotal = item.product.price.mul(item.quantity);
                totalAmount = totalAmount.add(lineTotal);

                orderItemsData.push({
                    productId: item.productId,
                    productName: item.product.name,
                    quantity: item.quantity,
                    price: item.product.price,
                });
            }

            const newOrder = await tx.order.create({
                data: {
                    userId,
                    status: OrderStatus.NEW,
                    totalAmount,
                    items: { createMany: { data: orderItemsData } },
                },
                include: { items: true },
            });

            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

            return newOrder;
        });

        await this.redis.delByPattern(`products:list:*`);

        await this.logger.log(
            OrdersService.name,
            `Order created: ${order.id}`,
            { userId, totalAmount: order.totalAmount },
        );

        return order;
    }

    async payOrder(userId: string, orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) throw new NotFoundException('Order not found');

        if (order.userId !== userId) {
            throw new ForbiddenException(
                'You do not have access to this order',
            );
        }

        if (order.status !== OrderStatus.NEW) {
            throw new BadRequestException(
                `Order cannot be paid in status ${order.status}`,
            );
        }

        await this.prisma.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.PAYMENT_PENDING },
        });

        const payment = this.mockChargePayment(order.totalAmount);

        if (!payment.success) {
            await this.cancelAndRestock(orderId);
            throw new BadRequestException(
                'Payment failed, order cancelled and stock restored',
            );
        }

        await this.prisma.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.PROCESSING },
        });

        await this.ordersQueue.add('process-order', { orderId: order.id });

        await this.logger.log(
            OrdersService.name,
            `Order payment processed and status changed to PROCESSING: ${order.id}`,
            { transactionId: payment.transactionId },
        );

        return {
            success: true,
            orderId: order.id,
            transactionId: payment.transactionId,
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private mockChargePayment(_amount: Prisma.Decimal): {
        success: boolean;
        transactionId: string;
    } {
        return { success: true, transactionId: `mock_${Date.now()}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private mockRefundPayment(_amount: Prisma.Decimal): {
        success: boolean;
        refundId: string;
    } {
        return { success: true, refundId: `refund_${Date.now()}` };
    }

    async cancelOrder(userId: string, orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true },
        });
        if (!order) throw new NotFoundException('Order not found');

        if (order.userId !== userId) {
            throw new ForbiddenException(
                'You do not have access to this order',
            );
        }

        if (order.status === OrderStatus.PAYMENT_PENDING) {
            throw new BadRequestException(
                'Cannot cancel order while payment is processing',
            );
        }

        const result = await this.finalizeCancellation(order);

        await this.logger.log(
            OrdersService.name,
            `Order cancelled by user: ${order.id}`,
            { userId },
        );

        return result;
    }

    private async finalizeCancellation(
        order: Prisma.OrderGetPayload<{ include: { items: true } }>,
    ) {
        if (order.status === OrderStatus.CANCELLED) {
            throw new BadRequestException('Order is already cancelled');
        }
        if (order.status === OrderStatus.COMPLETED) {
            throw new BadRequestException('Cannot cancel a completed order');
        }

        let refund: { success: boolean; refundId: string } | null = null;
        if (order.status !== OrderStatus.NEW) {
            refund = this.mockRefundPayment(order.totalAmount);
            if (!refund.success) {
                throw new BadRequestException(
                    'Refund failed, please contact support',
                );
            }
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            for (const item of order.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: item.quantity } },
                });
            }

            return tx.order.update({
                where: { id: order.id },
                data: { status: OrderStatus.CANCELLED },
                include: { items: true },
            });
        });

        await this.redis.delByPattern(`products:list:*`);

        return { order: updated, refund };
    }

    private async cancelAndRestock(orderId: string) {
        await this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { items: true },
            });
            if (!order) return;

            for (const item of order.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: item.quantity } },
                });
            }

            await tx.order.update({
                where: { id: orderId },
                data: { status: OrderStatus.CANCELLED },
            });
        });

        await this.redis.delByPattern(`products:list:*`);
    }

    async findMyOrders(userId: string) {
        return this.prisma.order.findMany({
            where: { userId },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(userId: string, userRole: Role, orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true },
        });
        if (!order) throw new NotFoundException('Order not found');

        if (userRole !== Role.ADMIN && order.userId !== userId) {
            throw new ForbiddenException(
                'You do not have access to this order',
            );
        }

        return order;
    }

    async findAll(query: QueryOrderDto) {
        const { status, page, limit } = query;

        const where: Prisma.OrderWhereInput = {
            ...(status && { status }),
        };

        const [items, total] = await this.prisma.$transaction([
            this.prisma.order.findMany({
                where,
                include: {
                    items: true,
                    user: { select: { id: true, email: true, nickName: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.order.count({ where }),
        ]);

        return {
            items,
            meta: { total, page, limit, pageCount: Math.ceil(total / limit) },
        };
    }

    async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (
            dto.status === OrderStatus.NEW ||
            dto.status === OrderStatus.PAYMENT_PENDING
        ) {
            throw new BadRequestException(
                `Cannot manually set status to ${dto.status}`,
            );
        }

        if (order.status === dto.status) {
            return order;
        }

        if (order.status === OrderStatus.PAYMENT_PENDING) {
            throw new BadRequestException(
                'Cannot change status while payment is in progress',
            );
        }

        if (
            order.status === OrderStatus.CANCELLED ||
            order.status === OrderStatus.COMPLETED
        ) {
            throw new BadRequestException(
                `Cannot change status of an already ${order.status.toLowerCase()} order`,
            );
        }

        if (
            order.status === OrderStatus.NEW &&
            dto.status !== OrderStatus.CANCELLED
        ) {
            throw new BadRequestException(
                'Unpaid order (NEW) can only be set to CANCELLED',
            );
        }

        if (dto.status === OrderStatus.CANCELLED) {
            const result = (await this.finalizeCancellation(order)).order;
            await this.logger.log(
                OrdersService.name,
                `Order status updated to CANCELLED: ${orderId}`,
            );
            return result;
        }

        const updatedOrder = await this.prisma.order.update({
            where: { id: orderId },
            data: { status: dto.status },
            include: { items: true },
        });

        await this.logger.log(
            OrdersService.name,
            `Order status updated to ${dto.status}: ${orderId}`,
        );

        return updatedOrder;
    }
}
